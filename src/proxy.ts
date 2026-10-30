import { NextRequest, NextResponse } from "next/server"
import { verifySessionToken } from "@/lib/session"

// Webhook Telegram memvalidasi X-Telegram-Bot-Api-Secret-Token sendiri.
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/cron/sync",
  "/api/telegram/webhook",
])

// Next.js 16: konvensi file "middleware" diganti "proxy" (file & nama fungsi).
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith("/api/")
  const isDashboard = pathname.startsWith("/dashboard")

  if (!isApi && !isDashboard) return NextResponse.next()
  if (isApi && PUBLIC_API.has(pathname)) return NextResponse.next()

  const session = req.cookies.get("admin_session")?.value
  const valid = await verifySessionToken(session)
  if (!valid) {
    if (isApi) return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 401 })
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = { matcher: ["/dashboard/:path*", "/api/:path*"] }
