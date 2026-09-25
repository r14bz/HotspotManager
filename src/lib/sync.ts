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

// ---------------------------------------------------------------------
// Fallback: catatan penjualan dari script "mikhmon" (on-login).
//
// Kenapa perlu ini: status voucher dideteksi dengan POLLING (cek
// uptime/bytes user hotspot tiap sync). Kalau router punya scheduler
// "Monitor Profile ..." yang menghapus user hotspot begitu masa aktifnya
// habis (dalam hitungan menit), dan interval sync lebih lambat dari itu,
// voucher yang sudah kepakai bisa terhapus dari MikroTik SEBELUM sync
// sempat melihatnya berstatus "used" -> penjualan hilang dari laporan.
//
// Mikhmon sendiri tidak kena masalah ini karena setiap voucher pertama
// kali dipakai, script on-login-nya membuat catatan PERMANEN lewat
// /system/script (comment="mikhmon", nama diisi data penjualan dipisah
// "-|-") yang tidak pernah dihapus scheduler manapun. Fungsi di bawah
// membaca catatan itu sebagai jaring pengaman kedua: HANYA mengisi
// voucher yang datanya kelewat oleh polling biasa, tidak pernah menimpa
// voucher yang sudah tercatat "used".
// ---------------------------------------------------------------------

const MIKHMON_MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
}

function parseMikhmonLogDate(dateStr: string, timeStr: string): string | null {
  // Format dari /system clock: "sep/24/2026" + "17:46:11"
  const parts = (dateStr || "").trim().split("/")
  if (parts.length !== 3) return null
  const mon = MIKHMON_MONTHS[(parts[0] || "").toLowerCase()]
  const day = String(parts[1] || "").padStart(2, "0")
  const year = parts[2]
  if (!mon || !day || !year) return null
  const time = (timeStr || "00:00:00").trim()
  // Router dianggap berzona WIB (+07:00). Ganti kalau router di zona lain.
  const d = new Date(`${year}-${mon}-${day}T${time}+07:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

type MikhmonLogEntry = {
  username: string
  price: number
  profileName: string
  soldAt: string
}

// Nama script dibuat on-login dengan format:
// "tanggal-|-jam-|-user-|-harga-|-ip-|-mac-|-durasi-|-profil-|-expired"
function parseMikhmonScriptName(name: string): MikhmonLogEntry | null {
  const parts = (name || "").split("-|-")
  if (parts.length < 9) return null
  const [dateStr, timeStr, username, priceStr, , , , profileName] = parts
  if (!username) return null
  const soldAt = parseMikhmonLogDate(dateStr, timeStr)
  if (!soldAt) return null
  const price = Number(String(priceStr).replace(/[^\d]/g, "")) || 0
  return { username, price, profileName: profileName || "unknown", soldAt }
}

// scripts: hasil mentah "/system/script/print" (sudah difilter comment=mikhmon
// di level query MikroTik, lihat pemanggilan di bawah).
async function applyMikhmonScriptLog(
  supabase: SupabaseServer,
  routerId: string,
  scripts: any[]
) {
  const entries = (scripts || [])
    .map((s: any) => parseMikhmonScriptName(s.name || ""))
    .filter((e): e is MikhmonLogEntry => !!e)

  if (entries.length === 0) return { checked: 0, filled: 0 }

  // Kalau username sama muncul lebih dari sekali (voucher dipakai ulang,
  // profile "up"), pakai catatan PALING AWAL sebagai waktu terjual.
  const byUsername = new Map<string, MikhmonLogEntry>()
  for (const e of entries) {
    const cur = byUsername.get(e.username)
    if (!cur || e.soldAt < cur.soldAt) byUsername.set(e.username, e)
  }

  const usernames = Array.from(byUsername.keys())
  const existingByUsername = new Map<string, ExistingRow>()

  for (const part of chunk(usernames, IN_CHUNK)) {
    const { data, error } = await supabase
      .from("vouchers")
      .select("username, status, used_at, price, note, price_override, created_at")
      .eq("router_id", routerId)
      .in("username", part)

    if (error) {
      console.error("Sync mikhmon-log: gagal baca existing:", error)
      continue
    }
    for (const row of (data || []) as ExistingRow[]) {
      existingByUsername.set(row.username, row)
    }
  }

  const updates: Record<string, any>[] = []
  for (const [username, entry] of byUsername) {
    const existing = existingByUsername.get(username)

    // Sudah tercatat "used" lewat polling biasa -> tidak perlu disentuh.
    // Catatan mikhmon di sini cuma jaring pengaman untuk yang KELEWAT.
    const alreadyUsed =
      existing?.status === "used" || existing?.status === "online" || !!existing?.used_at
    if (alreadyUsed) continue

    updates.push({
      router_id: routerId,
      username,
      password: username,
      profile_name: entry.profileName,
      price:
        existing?.price_override && existing.price != null ? existing.price : entry.price,
      status: "used",
      used_at: entry.soldAt,
      sold_at: entry.soldAt,
      // note & price_override sengaja tidak disertakan, sama seperti sync biasa.
      comment: "mikhmon-log",
    })
  }

  if (updates.length > 0) {
    for (const part of chunk(updates, UPSERT_CHUNK)) {
      const { error } = await supabase
        .from("vouchers")
        .upsert(part, { onConflict: "router_id,username" })
      if (error) console.error("Sync mikhmon-log: gagal upsert:", error)
    }
  }

  return { checked: usernames.length, filled: updates.length }
}

// Sync satu router tertentu. Dipakai oleh /api/mikrotik/vouchers (browser,
// untuk router yang sedang aktif dipilih) dan /api/cron/sync (loop semua router).
//
// ATURAN HARGA:
// 1. Voucher belum terpakai  -> selalu mengikuti harga profile di Pengaturan.
// 2. Voucher sudah terpakai  -> mempertahankan harga saat terjual.
// 3. price_override = true   -> harga manual, tidak pernah ditimpa sync.
export async function syncVouchersFromMikrotik(routerId: string) {
  const { users, active, mikhmonScripts } = await withMikrotik(routerId, async (conn) => {
    const [users, active, mikhmonScripts] = await Promise.all([
      conn.write("/ip/hotspot/user/print"),
      conn.write("/ip/hotspot/active/print"),
      // Query difilter di sisi MikroTik supaya tidak menarik semua script.
      conn.write("/system/script/print", ["?comment=mikhmon"]).catch((e: any) => {
        console.error("Sync: gagal baca /system/script (mikhmon-log dilewati):", e)
        return []
      }),
    ])
    return { users, active, mikhmonScripts }
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

    // Jangan pernah TURUNKAN status voucher yang sudah pernah terpakai
    // kembali menjadi "unused". Begitu user logout / sesi berakhir,
    // uptime & bytes di MikroTik kosong sehingga status dihitung ulang
    // jadi "unused", padahal used_at sudah tercatat — voucher yang sama
    // akan dihitung DUA KALI di laporan (terpakai DAN belum dipakai) dan
    // tampil "Belum Dipakai" di halaman Kelola Voucher.
    if (wasAlreadyUsed && status === "unused") {
      status = disabled ? "disabled" : "used"
    }

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

  // Jaring pengaman kedua: isi voucher yang sudah terlanjur hilang dari
  // MikroTik (mis. dihapus scheduler expired-cleanup) tapi tercatat di
  // log on-login mikhmon. Hanya dijalankan kalau upsert utama sukses,
  // supaya tidak menambah data baru di atas state yang belum pasti benar.
  let mikhmonLog = { checked: 0, filled: 0 }
  if (synced) {
    try {
      mikhmonLog = await applyMikhmonScriptLog(supabase, routerId, mikhmonScripts)
    } catch (e) {
      console.error("Sync mikhmon-log gagal total:", e)
    }
  }

  return { count: list.length, data: list, synced, mikhmonLog }
}

// Sync SEMUA router — dipakai oleh cron (tidak terikat "router yang lagi
// dipilih di browser" karena cron jalan tanpa ada yang buka app).
export async function syncAllRouters() {
  const supabase = await createClient()
  const { data: routers, error } = await supabase.from("routers").select("id, name")
  if (error) throw error

  // Tiap router punya koneksi & data sendiri, jadi disinkronkan BERBARENGAN
  // (maks. CONCURRENCY sekaligus) — sebelumnya satu per satu sehingga waktunya
  // menumpuk dan mendekati batas waktu tunggu cron.
  const CONCURRENCY = 3
  const list = routers || []
  const results: any[] = []

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const batch = list.slice(i, i + CONCURRENCY)
    const done = await Promise.all(
      batch.map(async (router) => {
        try {
          const result = await syncVouchersFromMikrotik(router.id)
          return { routerId: router.id, name: router.name, ...result }
        } catch (e: any) {
          return {
            routerId: router.id,
            name: router.name,
            synced: false,
            error: e?.message || "gagal sync",
          }
        }
      })
    )
    results.push(...done)
  }
  return results
}
