import { createClient } from "@/lib/supabase/server"
import { withMikrotik } from "@/lib/mikrotik"
import { defaultSettings, resolvePrice } from "@/lib/settings"

// Ukuran potongan untuk query .in() dan upsert. Sebelumnya semua username
// dikirim sekaligus: URL bisa kepanjangan dan hasil terpotong 1000 baris,
// sehingga data lama dianggap kosong dan used_at ikut ter-reset.
const IN_CHUNK = 200
const UPSERT_CHUNK = 500

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Format uptime RouterOS ("1w2d3h4m5s") -> detik.
function parseUptimeSeconds(uptime: string): number {
  if (!uptime) return 0
  const units: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 }
  let total = 0
  for (const m of uptime.matchAll(/(\d+)([wdhms])/g)) {
    total += Number(m[1]) * units[m[2]]
  }
  return total
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

// MikroTik = sumber kebenaran. Baris voucher yang BELUM PERNAH dipakai dan
// sudah tidak ada di MikroTik (mis. dihapus lewat WinBox) dibersihkan dari
// database supaya angka "Belum Dipakai" di laporan tidak menggembung.
// Voucher yang sudah terpakai TIDAK pernah disentuh (arsip laporan).
async function pruneOrphanUnused(
  supabase: SupabaseServer,
  routerId: string,
  keep: Set<string>
) {
  const PAGE = 1000
  const orphans: string[] = []

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("vouchers")
      .select("username")
      .eq("router_id", routerId)
      .eq("status", "unused")
      .is("used_at", null)
      .is("sold_at", null)
      .order("username", { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw error
    for (const row of data || []) {
      if (!keep.has(row.username)) orphans.push(row.username)
    }
    if (!data || data.length < PAGE) break
  }

  for (const part of chunk(orphans, IN_CHUNK)) {
    const { error } = await supabase
      .from("vouchers")
      .delete()
      .eq("router_id", routerId)
      .eq("status", "unused")
      .is("used_at", null)
      .is("sold_at", null)
      .in("username", part)
    if (error) throw error
  }
}

type ExistingRow = {
  username: string
  status: string | null
  used_at: string | null
  price: number | null
  note: string | null
  price_override: boolean | null
  created_at: string | null
}

// Sync satu router tertentu. Dipakai oleh /api/mikrotik/vouchers (browser,
// untuk router yang sedang aktif dipilih) dan /api/cron/sync (loop semua router).
//
// ATURAN HARGA:
// 1. Voucher belum terpakai  -> selalu mengikuti harga profile di Pengaturan.
// 2. Voucher sudah terpakai  -> mempertahankan harga saat terjual.
// 3. price_override = true   -> harga manual, tidak pernah ditimpa sync.
export async function syncVouchersFromMikrotik(routerId: string) {
  const { users, active } = await withMikrotik(routerId, async (conn) => {
    const [users, active] = await Promise.all([
      conn.write("/ip/hotspot/user/print"),
      conn.write("/ip/hotspot/active/print"),
    ])
    return { users, active }
  })

  const activeNames = new Set((active || []).map((u: any) => u.user || u.name))

  // Harga diambil dari Supabase (diatur admin di Pengaturan) UNTUK ROUTER INI.
  let prices = defaultSettings.prices
  const supabase = await createClient()
  try {
    const { data: settingsRow } = await supabase
      .from("app_settings")
      .select("prices")
      .eq("router_id", routerId)
      .maybeSingle()

    if (settingsRow?.prices) {
      prices = { ...defaultSettings.prices, ...settingsRow.prices }
    }
  } catch {
    // pakai default
  }

  // Ambil data yang sudah tercatat di Supabase LEBIH DULU, per potongan.
  // Kalau ada potongan yang gagal, existingOk = false dan upsert DILEWATI
  // (lebih baik tidak menyimpan daripada menimpa used_at / harga dengan
  // nilai keliru karena data lama tidak terbaca).
  const usernamesFromMikrotik: string[] = Array.from(
    new Set<string>((users || []).map((u: any) => u.name).filter(Boolean))
  )
  const existingByUsername = new Map<string, ExistingRow>()
  let existingOk = true

  for (const part of chunk(usernamesFromMikrotik, IN_CHUNK)) {
    try {
      const { data, error } = await supabase
        .from("vouchers")
        .select("username, status, used_at, price, note, price_override, created_at")
        .eq("router_id", routerId)
        .in("username", part)

      if (error) throw error
      for (const row of (data || []) as ExistingRow[]) {
        existingByUsername.set(row.username, row)
      }
    } catch (e) {
      console.error("Sync: gagal membaca data existing:", e)
      existingOk = false
      break
    }
  }

  const nowMs = Date.now()
  const payloads: Record<string, any>[] = []

  const list = (users || []).map((u: any) => {
    const username = u.name || ""
    const profileName = u.profile || "-"
    const isOnline = activeNames.has(username)
    const disabled = u.disabled === "true" || u.disabled === true
    const uptime = u.uptime || "0s"
    const bytesIn = Number(u["bytes-in"] || 0)
    const bytesOut = Number(u["bytes-out"] || 0)

    const hasTraffic = bytesIn > 0 || bytesOut > 0
    const hasUptime = uptime && uptime !== "0s" && uptime !== "00:00:00" && uptime !== "0"

    let status = "unused"
    if (disabled) status = "disabled"
    else if (isOnline) status = "online"
    else if (hasUptime || hasTraffic) status = "used"

    const existing = existingByUsername.get(username)
    const wasAlreadyUsed =
      existing?.status === "used" || existing?.status === "online" || !!existing?.used_at
    // Voucher yang di-disable setelah dipakai (status "disabled" tapi ada
    // uptime/traffic) tetap dianggap terpakai, supaya tercatat di laporan.
    const isUsedNow =
      status === "used" ||
      status === "online" ||
      (disabled && !!(hasUptime || hasTraffic))

    // --- Harga ---
    let price: number
    if (existing?.price_override && existing.price != null) {
      price = existing.price
    } else if (wasAlreadyUsed && existing?.price != null) {
      price = existing.price
    } else {
      price = resolvePrice(profileName, prices)
    }

    // --- used_at ---
    // Pertama kali terdeteksi terpakai: MikroTik tidak menyimpan waktu
    // login pertama, jadi diperkirakan dari (sekarang - uptime). Ini jauh
    // lebih dekat ke waktu pemakaian sebenarnya dibanding "waktu sync".
    // Tidak boleh lebih awal dari waktu voucher dibuat.
    let usedAt: string | null = existing?.used_at ?? null
    if (isUsedNow && !wasAlreadyUsed) {
      let estimated = nowMs - parseUptimeSeconds(uptime) * 1000
      const createdMs = existing?.created_at ? new Date(existing.created_at).getTime() : NaN
      if (Number.isFinite(createdMs) && estimated < createdMs) estimated = createdMs
      usedAt = new Date(estimated).toISOString()
    }

    payloads.push({
      router_id: routerId,
      username,
      password: u.password || username,
      profile_name: profileName,
      price,
      limit_uptime: u["limit-uptime"] || "",
      status: status === "online" ? "used" : status,
      comment: u.comment || "",
      // note & price_override sengaja TIDAK disertakan supaya tidak
      // menimpa nilai yang sudah ada.
      used_at: usedAt,
    })

    return {
      id: u[".id"],
      username,
      password: u.password || username,
      profile_name: profileName,
      price,
      limit_uptime: u["limit-uptime"] || "",
      uptime,
      disabled,
      comment: u.comment || "",
      note: existing?.note ?? null,
      status,
      bytesIn,
      bytesOut,
    }
  })

  let synced = false
  if (!existingOk) {
    console.error("Sync Supabase dilewati: data existing tidak terbaca penuh")
  } else {
    try {
      for (const part of chunk(payloads, UPSERT_CHUNK)) {
        const { error } = await supabase
          .from("vouchers")
          .upsert(part, { onConflict: "router_id,username" })
        if (error) throw error
      }
      synced = true
    } catch (e) {
      console.error("Sync Supabase failed:", e)
    }

    // Hanya bersihkan kalau upsert sukses DAN MikroTik mengembalikan daftar
    // yang tidak kosong (daftar kosong lebih mungkin gangguan daripada
    // kenyataan, jadi jangan dipakai sebagai dasar menghapus).
    if (synced && usernamesFromMikrotik.length > 0) {
      try {
        await pruneOrphanUnused(supabase, routerId, new Set(usernamesFromMikrotik))
      } catch (e) {
        console.error("Sync: gagal membersihkan voucher yatim:", e)
      }
    }
  }

  return { count: list.length, data: list, synced }
}

// Sync SEMUA router — dipakai oleh cron (tidak terikat "router yang lagi
// dipilih di browser" karena cron jalan tanpa ada yang buka app).
export async function syncAllRouters() {
  const supabase = await createClient()
  const { data: routers } = await supabase.from("routers").select("id, name")

  const results = []
  for (const router of routers || []) {
    try {
      const result = await syncVouchersFromMikrotik(router.id)
      results.push({ routerId: router.id, name: router.name, ...result })
    } catch (e: any) {
      results.push({
        routerId: router.id,
        name: router.name,
        synced: false,
        error: e?.message || "gagal sync",
      })
    }
  }
  return results
}
