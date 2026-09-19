import { NextRequest, NextResponse } from "next/server"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

// Proxy gambar logo, HANYA dipakai VoucherCard untuk mengukur padding
// transparan logo lewat canvas. Logo dari domain lain biasanya tidak
// mengirim header CORS, sehingga canvas "tainted" dan tidak bisa dibaca.
// Lewat route ini gambar jadi same-origin.
//
// Route ini ada di balik login admin (middleware), dan tetap memblokir
// alamat internal/private supaya tidak bisa dipakai untuk SSRF.

export const runtime = "nodejs"

const MAX_BYTES = 5 * 1024 * 1024

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  const v6 = ip.toLowerCase()
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    v6.startsWith("::ffff:")
  )
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") || ""

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ success: false, message: "URL tidak valid" }, { status: 400 })
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json({ success: false, message: "Protokol tidak didukung" }, { status: 400 })
  }

  const host = target.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return NextResponse.json({ success: false, message: "Host tidak diizinkan" }, { status: 400 })
  }

  try {
    const addrs = isIP(host)
      ? [{ address: host }]
      : await lookup(host, { all: true })
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
      return NextResponse.json({ success: false, message: "Host tidak diizinkan" }, { status: 400 })
    }

    const res = await fetch(target.toString(), {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "image/*" },
    })

    if (!res.ok) {
      return NextResponse.json({ success: false, message: "Gagal mengambil gambar" }, { status: 502 })
    }

    const type = res.headers.get("content-type") || ""
    if (!type.startsWith("image/")) {
      return NextResponse.json({ success: false, message: "Bukan file gambar" }, { status: 415 })
    }

    const declared = Number(res.headers.get("content-length") || 0)
    if (declared > MAX_BYTES) {
      return NextResponse.json({ success: false, message: "Gambar terlalu besar" }, { status: 413 })
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ success: false, message: "Gambar terlalu besar" }, { status: 413 })
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    })
  } catch {
    return NextResponse.json({ success: false, message: "Gagal mengambil gambar" }, { status: 502 })
  }
}
