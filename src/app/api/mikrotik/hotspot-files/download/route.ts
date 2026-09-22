import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { downloadHotspotFolder } from "@/lib/hotspot-ftp"

export const runtime = "nodejs"
export const maxDuration = 60

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
    const { folder: cleanFolder, files, skipped } = await downloadHotspotFolder(routerId, folder)

    const zip = new JSZip()
    for (const file of files) {
      zip.file(file.path, file.data)
    }
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })

    const filename = `${cleanFolder}-${new Date().toISOString().slice(0, 10)}.zip`

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBuffer.length),
        // Beri tahu lewat header custom kalau ada file yang gagal diambil,
        // supaya UI bisa tampilkan peringatan tanpa perlu buka isi zip dulu.
        "X-Skipped-Files": String(skipped.length),
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Gagal mendownload folder" },
      { status: 500 }
    )
  }
}
