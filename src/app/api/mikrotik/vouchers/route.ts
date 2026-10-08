import { NextRequest, NextResponse } from "next/server"
import { syncVouchersFromMikrotik } from "@/lib/sync"
import { MikrotikTimeoutError } from "@/lib/mikrotik"

export const runtime = "nodejs"
// Batas sendiri di dalam sync (maks ± 80 dtk untuk MikroTik) selalu habis
// sebelum ini, jadi error yang muncul adalah JSON yang jelas, bukan 504 mentah.
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const routerId = req.nextUrl.searchParams.get("router_id")
  if (!routerId) {
    return NextResponse.json(
      { success: false, message: "router_id wajib disertakan", data: [] },
      { status: 400 }
    )
  }

  try {
    const result = await syncVouchersFromMikrotik(routerId)

    return NextResponse.json({
      success: true,
      count: result.count,
      data: result.data,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Gagal mengambil data dari MikroTik",
        data: [],
      },
      { status: error instanceof MikrotikTimeoutError ? 504 : 500 }
    )
  }
}
