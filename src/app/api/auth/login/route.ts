import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createHash, timingSafeEqual } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { verifyPassword } from "@/lib/password"
import { createSessionToken } from "@/lib/session"

// Rate limit login: maksimal MAX_FAILED kegagalan per IP dalam WINDOW_MS.
// Disimpan di Supabase (tabel login_attempts) karena di serverless memori
// biasa tidak dibagi antar instance, jadi penghitung di memori tidak andal.
const MAX_FAILED = 5
const WINDOW_MS = 15 * 60 * 1000

type Supabase = Awaited<ReturnType<typeof createClient>>

// Perbandingan waktu-konstan (lewat hash supaya panjangnya selalu sama).
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  )
}

async function recordFailure(supabase: Supabase, ip: string) {
  try {
    const { error } = await supabase.from("login_attempts").insert({ ip })
    if (error) console.error("login_attempts insert gagal:", error.message)

    // Bersihkan catatan lama (> 1 hari) sekalian.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    await supabase.from("login_attempts").delete().lt("created_at", cutoff)
  } catch (e) {
    console.error("recordFailure error:", e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const username = String(body.username || "").trim()
    const password = String(body.password || "")

    if (!password) {
      return NextResponse.json(
        { success: false, message: "Password wajib diisi" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const ip = clientIp(req)

    // 1. Rate limit. Kalau tabelnya belum ada / error, jangan mengunci
    //    admin: lanjut tanpa pembatasan (dan catat di log).
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const { count, error: countErr } = await supabase
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since)

    if (countErr) {
      console.error("Rate limit dilewati (login_attempts):", countErr.message)
    } else if ((count ?? 0) >= MAX_FAILED) {
      return NextResponse.json(
        {
          success: false,
          message: "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.",
        },
        { status: 429, headers: { "Retry-After": String(WINDOW_MS / 1000) } }
      )
    }

    // 2. Verifikasi kredensial
    const adminUser = process.env.ADMIN_USERNAME || "admin"
    let valid = false

    if (safeEqual(username, adminUser)) {
      const { data: config, error: cfgErr } = await supabase
        .from("admin_config")
        .select("password_hash")
        .eq("id", 1)
        .maybeSingle()

      // Gagal membaca database = TOLAK (fail closed). Sebelumnya jatuh ke
      // password env, sehingga password lama yang sudah diganti bisa
      // dipakai lagi saat database sedang bermasalah.
      if (cfgErr) {
        console.error("Login: gagal membaca admin_config:", cfgErr.message)
        return NextResponse.json(
          {
            success: false,
            message: "Layanan sementara tidak tersedia. Coba lagi sebentar.",
          },
          { status: 503 }
        )
      }

      if (config?.password_hash) {
        valid = await verifyPassword(password, config.password_hash)
      } else {
        // Belum pernah ganti password -> pakai env. Env KOSONG tidak
        // boleh dianggap valid (sebelumnya password kosong bisa lolos).
        const envPass = process.env.ADMIN_PASSWORD || ""
        valid = envPass.length > 0 && safeEqual(password, envPass)
      }
    }

    if (!valid) {
      await recordFailure(supabase, ip)
      return NextResponse.json(
        { success: false, message: "Username atau password salah" },
        { status: 401 }
      )
    }

    const token = await createSessionToken()

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Server belum dikonfigurasi dengan benar (AUTH_SECRET belum diset). Hubungi admin.",
        },
        { status: 500 }
      )
    }

    // Login berhasil: reset hitungan gagal untuk IP ini.
    try {
      await supabase.from("login_attempts").delete().eq("ip", ip)
    } catch {
      // abaikan
    }

    const cookieStore = await cookies()

    cookieStore.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    return NextResponse.json({ success: true, message: "Login berhasil" })
  } catch (error: any) {
    // Jangan bocorkan pesan internal (mis. nama env var) ke pengunjung
    // yang belum login; cukup di log server.
    console.error("Login error:", error)
    return NextResponse.json(
      { success: false, message: "Gagal login" },
      { status: 500 }
    )
  }
}
