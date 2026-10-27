import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual, randomInt } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { getMikrotikConnection } from "@/lib/mikrotik"

export const runtime = "nodejs"
export const maxDuration = 60
const ROUTER_NAME = process.env.TELEGRAM_ROUTER_NAME || "Mamanaiy.net"
const MAX_GENERATE = 10
const pad = (n: number) => String(n).padStart(2, "0")
const cleanRows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v as Record<string, unknown>[] : v && typeof v === "object" ? [v as Record<string, unknown>] : []
const val = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (r[k] != null) return String(r[k]); return "" }
function secretOk(a: string | null, b: string | undefined) {
  if (!a || !b) return false
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
function allowed(id: number | undefined, type: string | undefined) {
  return !!id && !!process.env.TELEGRAM_ADMIN_USER_ID && String(id) === process.env.TELEGRAM_ADMIN_USER_ID && type === "private"
}
async function tg(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diatur")
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.description || "Telegram API gagal")
  return j.result
}
async function send(chat: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true, ...extra })
}
async function callbackAnswer(id: string, text: string) { try { await tg("answerCallbackQuery", { callback_query_id: id, text }) } catch {} }
async function router() {
  const db = await createClient()
  const { data, error } = await db.from("routers").select("id,name").eq("name", ROUTER_NAME).maybeSingle()
  if (error || !data) throw new Error("Router " + ROUTER_NAME + " tidak ditemukan atau database gagal dibaca")
  return data as { id: string; name: string }
}
async function withRouter<T>(fn: (conn: Awaited<ReturnType<typeof getMikrotikConnection>>, routerId: string) => Promise<T>): Promise<T> {
  const r = await router(), conn = await getMikrotikConnection(r.id, 15)
  try { return await fn(conn, r.id) } finally { try { conn.close() } catch {} }
}
function wibDate(d: Date) { return new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10) }
function code(length = 8) { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length }, () => chars[randomInt(chars.length)]).join("") }
async function command(chat: number, raw: string) {
  const p = raw.trim().split(/\s+/), cmd = (p[0] || "").toLowerCase(), db = await createClient()
  if (cmd === "/start" || cmd === "/help") return send(chat,
    "HotspotManager • Admin bot\nRouter: " + ROUTER_NAME +
    "\n\n/status — resource router\n/online — user aktif\n/vouchers — ringkasan voucher\n/profiles — profile hotspot\n/sales today atau /sales month\n/generate JUMLAH PROFILE HARGA\n/disable USERNAME\n/enable USERNAME\n/disconnect USERNAME\n/router reboot\n\nAksi perubahan perlu konfirmasi dan bot hanya bekerja di chat pribadi admin.")
  if (cmd === "/status") return withRouter(async c => {
    const out = await Promise.all([c.write("/system/resource/print"), c.write("/system/identity/print"), c.write("/system/routerboard/print").catch(() => [])])
    const a = cleanRows(out[0])[0] || {}, b = cleanRows(out[1])[0] || {}, d = cleanRows(out[2])[0] || {}
    return send(chat, "Router: " + ROUTER_NAME + "\nIdentity: " + (val(b, "name") || "-") + "\nBoard: " + (val(d, "model") || "-") + "\nRouterOS: " + (val(a, "version") || "-") + "\nUptime: " + (val(a, "uptime") || "-") + "\nCPU: " + (val(a, "cpu-load") || "-") + "%\nRAM bebas: " + (val(a, "free-memory") ? Math.round(Number(val(a, "free-memory")) / 1048576) + " MB" : "-"))
  })
  if (cmd === "/online") return withRouter(async c => {
    const active = cleanRows(await c.write("/ip/hotspot/active/print"))
    const lines = active.slice(0, 30).map((r, i) => (i + 1) + ". " + (val(r, "user", "name") || "?") + " — " + (val(r, "address") || "-") + " — " + (val(r, "uptime") || "-"))
    return send(chat, "User aktif: " + active.length + (lines.length ? "\n" + lines.join("\n") : "\nTidak ada user aktif.") + (active.length > 30 ? "\nDan " + (active.length - 30) + " lainnya." : ""))
  })
  if (cmd === "/profiles") return withRouter(async c => {
    const profiles = cleanRows(await c.write("/ip/hotspot/user/profile/print")).map(r => val(r, "name")).filter(Boolean)
    return send(chat, "Profile di " + ROUTER_NAME + ":\n" + (profiles.map(x => "• " + x).join("\n") || "Tidak ada profile terbaca."))
  })
  if (cmd === "/vouchers") {
    const r = await router()
    // Supabase REST defaults to a limited page (often 1,000 rows). Read every page
    // so imported Mikhmon history is included in the summary.
    const pageSize = 1000
    const all: { status: string | null; price: number | string | null; profile_name: string | null; sold_at: string | null; used_at: string | null }[] = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from("vouchers")
        .select("status,price,profile_name,sold_at,used_at")
        .eq("router_id", r.id)
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) throw new Error("Gagal membaca voucher dari Supabase")
      const page = data || []
      all.push(...page)
      if (page.length < pageSize) break
    }
    const unused = all.filter(v => v.status === "unused")
    const used = all.filter(v => ["used", "online"].includes((v.status || "").toLowerCase()) || !!v.sold_at || !!v.used_at)
    const disabled = all.filter(v => (v.status || "").toLowerCase() === "disabled")
    return send(chat, "Voucher " + ROUTER_NAME +
      "\\nTotal: " + all.length +
      "\\nBelum dipakai: " + unused.length +
      "\\nTerpakai/terjual: " + used.length +
      (disabled.length ? "\\nDinonaktifkan: " + disabled.length : "") +
      "\\nNilai terpakai: Rp" + used.reduce((s, v) => s + (Number(v.price) || 0), 0).toLocaleString("id-ID"))
  }
  if (cmd === "/sales") {
    const mode = (p[1] || "today").toLowerCase()
    if (mode !== "today" && mode !== "month") return send(chat, "Gunakan /sales today atau /sales month.")
    const today = wibDate(new Date()), month = today.slice(0, 7)
    const start = mode === "today" ? new Date(today + "T00:00:00+07:00") : new Date(month + "-01T00:00:00+07:00")
    const end = mode === "today" ? new Date(start.getTime() + 86400000) : new Date((Number(month.slice(0, 4)) + (month.slice(5) === "12" ? 1 : 0)) + "-" + pad(Number(month.slice(5)) === 12 ? 1 : Number(month.slice(5)) + 1) + "-01T00:00:00+07:00")
    const r = await router(), { data, error } = await db.from("vouchers").select("username,profile_name,price,status,sold_at,used_at,created_at").eq("router_id", r.id).or("and(created_at.gte." + start.toISOString() + ",created_at.lt." + end.toISOString() + "),and(used_at.gte." + start.toISOString() + ",used_at.lt." + end.toISOString() + "),and(sold_at.gte." + start.toISOString() + ",sold_at.lt." + end.toISOString() + ")").limit(5000)
    if (error) throw new Error("Gagal membaca laporan")
    const sales = (data || []).filter(v => !["default", "trial-user", "-"].includes((v.profile_name || "").trim().toLowerCase()) && (v.status === "used" || v.status === "online" || !!v.sold_at || !!v.used_at) && new Date(v.used_at || v.sold_at || v.created_at || 0) >= start && new Date(v.used_at || v.sold_at || v.created_at || 0) < end)
    return send(chat, "Penjualan " + (mode === "today" ? today : month) + " WIB\nRouter: " + ROUTER_NAME + "\nVoucher terpakai: " + sales.length + "\nPendapatan: Rp" + sales.reduce((s, v) => s + (Number(v.price) || 0), 0).toLocaleString("id-ID") + ((data || []).length >= 5000 ? "\nPERINGATAN: hasil mungkin terpotong pada 5.000 baris." : ""))
  }
  if (cmd === "/generate" && process.env.TELEGRAM_ENABLE_WRITES !== "true") return send(chat, "Mode aman: aksi perubahan router masih dinonaktifkan. Aktifkan TELEGRAM_ENABLE_WRITES=true setelah pengujian dan persetujuan.");
  if (cmd === "/generate") {
    const n = Number(p[1]), profile = p[2], price = Number(p[3])
    if (!Number.isInteger(n) || n < 1 || n > MAX_GENERATE || !profile || profile.length > 24 || !Number.isFinite(price) || price < 0 || !/^[\w./-]+$/.test(profile)) return send(chat, "Format: /generate JUMLAH PROFILE HARGA\nContoh: /generate 3 2jam/2k 2000\nMaksimum 10 voucher.")
    return send(chat, "Konfirmasi generate " + n + " voucher di " + ROUTER_NAME + "\nProfile: " + profile + "\nHarga: Rp" + price.toLocaleString("id-ID"), { reply_markup: { inline_keyboard: [[{ text: "Ya, generate", callback_data: "c|gen|" + n + "|" + profile + "|" + price }, { text: "Batal", callback_data: "c|cancel" }]] } })
  }
  if (["/disable", "/enable", "/disconnect"].includes(cmd) && process.env.TELEGRAM_ENABLE_WRITES !== "true") return send(chat, "Mode aman: aksi perubahan router masih dinonaktifkan. Aktifkan TELEGRAM_ENABLE_WRITES=true setelah pengujian dan persetujuan.");
  if (["/disable", "/enable", "/disconnect"].includes(cmd)) {
    const username = p[1]
    if (!username || username.length > 32 || !/^[\w.-]+$/.test(username)) return send(chat, "Format: " + cmd + " USERNAME")
    return send(chat, "Konfirmasi " + cmd.slice(1) + " user " + username + " di " + ROUTER_NAME + "?", { reply_markup: { inline_keyboard: [[{ text: "Konfirmasi", callback_data: "c|" + cmd.slice(1) + "|" + username }, { text: "Batal", callback_data: "c|cancel" }]] } })
  }
  if (cmd === "/router" && p[1] === "reboot" && process.env.TELEGRAM_ENABLE_WRITES !== "true") return send(chat, "Mode aman: reboot router dinonaktifkan. Aktifkan TELEGRAM_ENABLE_WRITES=true hanya setelah pengujian dan persetujuan.");
  if (cmd === "/router" && p[1] === "reboot") return send(chat, "⚠️ Konfirmasi REBOOT router " + ROUTER_NAME + ". Koneksi pengguna akan terputus sementara.", { reply_markup: { inline_keyboard: [[{ text: "Ya, reboot", callback_data: "c|reboot" }, { text: "Batal", callback_data: "c|cancel" }]] } })
  return send(chat, "Perintah tidak dikenal. Kirim /help.")
}
async function confirmed(chat: number, raw: string) {
  const p = raw.split("|"), action = p[1]
  if (action === "cancel") return send(chat, "Aksi dibatalkan.")
  if (process.env.TELEGRAM_ENABLE_WRITES !== "true") return send(chat, "Mode aman: aksi perubahan router dinonaktifkan. TELEGRAM_ENABLE_WRITES belum diaktifkan.")
  if (action === "gen") {
    const n = Number(p[2]), profile = p[3] || "", price = Number(p[4])
    if (!Number.isInteger(n) || n < 1 || n > MAX_GENERATE || !/^[\w./-]{1,24}$/.test(profile) || !Number.isFinite(price) || price < 0) throw new Error("Parameter generate tidak valid")
    return withRouter(async (c, routerId) => {
      const profiles = cleanRows(await c.write("/ip/hotspot/user/profile/print"))
      if (!profiles.some(x => val(x, "name") === profile)) throw new Error("Profile tidak ditemukan di router")
      const db = await createClient(), codes: string[] = []
      for (let i = 0; i < n; i++) {
        const username = code()
        await c.write("/ip/hotspot/user/add", ["=name=" + username, "=password=" + username, "=profile=" + profile, "=comment=telegram-" + new Date().toISOString().slice(0, 10)])
        codes.push(username)
      }
      const { data: batch, error: be } = await db.from("voucher_batches").insert({ router_id: routerId, profile_name: profile, quantity: codes.length, prefix: null, price, generated_by: "telegram" }).select("id").maybeSingle()
      const records = codes.map(username => ({ router_id: routerId, batch_id: batch?.id || null, username, password: username, profile_name: profile, price, status: "unused", comment: "telegram-bot" }))
      const { error: ve } = await db.from("vouchers").upsert(records, { onConflict: "router_id,username" })
      if (be || ve) return send(chat, "PERINGATAN: voucher dibuat di router tetapi catatan database gagal. Jalankan Sync dan periksa dashboard. Kode: " + codes.join(", "))
      return send(chat, "Berhasil generate " + codes.length + " voucher di " + ROUTER_NAME + "\nProfile: " + profile + "\nHarga: Rp" + price.toLocaleString("id-ID") + "\n\n" + codes.join("\n"))
    })
  }
  if (["disable", "enable", "disconnect"].includes(action)) {
    const username = p[2] || ""
    if (!/^[\w.-]{1,32}$/.test(username)) throw new Error("Username tidak valid")
    return withRouter(async c => {
      if (action === "disconnect") {
        const active = cleanRows(await c.write("/ip/hotspot/active/print", ["?user=" + username]))
        if (!active.length) return send(chat, "Tidak ada sesi aktif untuk " + username + ".")
        for (const s of active) { const id = val(s, ".id", "id"); if (id) await c.write("/ip/hotspot/active/remove", ["=.id=" + id]) }
        return send(chat, "Sesi aktif " + username + " diputus.")
      }
      const found = cleanRows(await c.write("/ip/hotspot/user/print", ["?name=" + username])).find(x => val(x, "name") === username)
      const id = found && val(found, ".id", "id")
      if (!id) return send(chat, "User " + username + " tidak ditemukan.")
      await c.write("/ip/hotspot/user/set", ["=.id=" + id, "=disabled=" + (action === "disable" ? "yes" : "no")])
      return send(chat, "User " + username + (action === "disable" ? " dinonaktifkan." : " diaktifkan."))
    })
  }
  if (action === "reboot") return withRouter(async c => { await c.write("/system/reboot"); return send(chat, "Perintah reboot dikirim ke " + ROUTER_NAME + ".") })
  throw new Error("Aksi konfirmasi tidak dikenal")
}
export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) return NextResponse.json({ ok: false }, { status: 401 })
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_ADMIN_USER_ID) return NextResponse.json({ ok: false }, { status: 503 })
  try {
    const update = await req.json(), m = update.message
    if (m) {
      if (!allowed(m.from?.id, m.chat?.type)) return NextResponse.json({ ok: true })
      if (typeof m.text === "string" && m.text.trim()) {
        const chatId = Number(m.chat.id)
        const raw = m.text.trim()
        const cmd = (raw.split(/\\s+/)[0] || "").toLowerCase()
        try {
          await command(chatId, raw)
        } catch (e) {
          // Keep the webhook responsive when the VPN/router is unreachable.
          // Log only the command and error message; never log credentials or tokens.
          console.error("Telegram command failed", cmd, e instanceof Error ? e.message : "unknown")
          if (["/status", "/online", "/profiles"].includes(cmd)) {
            await send(chatId, "MikroTik tidak dapat dijangkau saat ini. VPN Murah Jogja mungkin sedang offline, atau koneksi/API router tidak merespons. Silakan coba lagi nanti. Mikrhoman juga dapat mengalami gangguan selama endpoint VPN offline.")
          } else {
            await send(chatId, "Perintah gagal diproses. Periksa koneksi database/router lalu coba lagi. Jika masalah berlanjut, periksa log runtime Vercel.")
          }
        }
      }
      return NextResponse.json({ ok: true })
    }
    const cb = update.callback_query
    if (cb) {
      if (!allowed(cb.from?.id, cb.message?.chat?.type)) { await callbackAnswer(cb.id, "Tidak diizinkan"); return NextResponse.json({ ok: true }) }
      try { await confirmed(Number(cb.message.chat.id), String(cb.data || "")); await callbackAnswer(cb.id, "Diproses") }
      catch (e) { await callbackAnswer(cb.id, "Gagal"); await send(Number(cb.message.chat.id), "Gagal: " + (e instanceof Error ? e.message.slice(0, 300) : "aksi gagal")) }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Telegram webhook error", e instanceof Error ? e.message : "unknown")
    return NextResponse.json({ ok: true })
  }
}
