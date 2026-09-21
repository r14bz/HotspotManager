import { NextRequest, NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import { syncAllRouters } from "@/lib/sync"

export const runtime = "nodejs"
// Sync beberapa router lewat VPN bisa memakan puluhan detik; beri ruang
// supaya fungsi tidak terpotong di tengah jalan.
export const maxDuration = 60

// Perbandingan waktu-konstan (lewat hash supaya panjangnya selalu sama).
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

// Sync SEMUA router yang terdaftar (bukan cuma satu) — dipanggil oleh
// Vercel Cron dan/atau cron eksternal, tidak terikat router mana yang
// sedang dipilih admin di browser.
//
// Autentikasi: HANYA lewat header "Authorization: Bearer <CRON_SECRET>".
// Rahasia di query string (?secret=...) tidak diterima lagi karena URL
// sering tercatat di log/riwayat layanan cron. Vercel Cron mengirim header
// ini otomatis kalau CRON_SECRET diset.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")
  const provided = match ? match[1].trim() : ""

  if (!secret) {
    return NextResponse.json(
      { success: false, message: "CRON_SECRET belum diset di environment variables" },
      { status: 500 }
    )
  }

  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const results = await syncAllRouters()
    return NextResponse.json({
      success: true,
      routers: results,
      time: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Gagal sync" },
      { status: 500 }
    )
  }
}
