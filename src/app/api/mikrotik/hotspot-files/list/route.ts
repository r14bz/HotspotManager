import { NextRequest, NextResponse } from "next/server"
import { listHotspotFiles } from "@/lib/hotspot-ftp"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const routerId = req.nextUrl.searchParams.get("router_id")
  const folder = req.nextUrl.searchParams.get("folder") || "hotspot"

  if (!routerId) {
    return NextResponse.json(
      { success: false, message: "router_id wajib disertakan" },
      { status: 400 }
    )
  }

  try {
    const result = await listHotspotFiles(routerId, folder)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Gagal membaca folder" },
      { status: 500 }
    )
  }
}
