import { createClient } from "@/lib/supabase/server"
import { withMikrotik } from "@/lib/mikrotik"
import { defaultSettings, resolvePrice } from "@/lib/settings"

// Sync satu router tertentu. Dipakai oleh /api/mikrotik/vouchers (browser,
// untuk router yang sedang aktif dipilih) dan /api/cron/sync (loop semua router).
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

  // Ambil data yang sudah tercatat di Supabase LEBIH DULU (termasuk note),
  // supaya bisa dilampirkan ke tiap voucher di respons DAN dipertahankan
  // (tidak ketimpa) saat upsert nanti.
  const usernamesFromMikrotik = (users || []).map((u: any) => u.name).filter(Boolean)
  const existingByUsername = new Map<
    string,
    { status: string | null; used_at: string | null; price: number | null; note: string | null }
  >()

  if (usernamesFromMikrotik.length > 0) {
    try {
      const { data: existing } = await supabase
        .from("vouchers")
        .select("username, status, used_at, price, note")
        .eq("router_id", routerId)
        .in("username", usernamesFromMikrotik)

      for (const row of existing || []) {
        existingByUsername.set(row.username, row)
      }
    } catch {
      // lanjut tanpa data existing
    }
  }

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

    return {
      id: u[".id"],
      username,
      password: u.password || username,
      profile_name: profileName,
      price: resolvePrice(profileName, prices),
      limit_uptime: u["limit-uptime"] || "",
      uptime,
      disabled,
      comment: u.comment || "",
      note: existingByUsername.get(username)?.note ?? null,
      status,
      bytesIn,
      bytesOut,
    }
  })

  let synced = false
  try {
    const payloads = list.map((v) => {
      const existing = existingByUsername.get(v.username)
      const wasAlreadyUsed =
        existing?.status === "used" || existing?.status === "online" || !!existing?.used_at
      const isUsedNow = v.status === "used" || v.status === "online"

      return {
        router_id: routerId,
        username: v.username,
        password: v.password,
        profile_name: v.profile_name,
        price: existing?.price ?? v.price,
        limit_uptime: v.limit_uptime,
        status: v.status === "online" ? "used" : v.status,
        comment: v.comment,
        // note TIDAK disertakan di sini supaya tidak menimpa nilai yang
        // sudah ada — kolom ini cuma pernah diisi manual saat generate,
        // sync tidak pernah mengubahnya.
        used_at:
          isUsedNow && !wasAlreadyUsed
            ? new Date().toISOString()
            : existing?.used_at ?? null,
      }
    })

    if (payloads.length > 0) {
      const { error } = await supabase
        .from("vouchers")
        .upsert(payloads, { onConflict: "router_id,username" })

      if (error) throw error
    }

    synced = true
  } catch (e) {
    console.error("Sync Supabase failed:", e)
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
