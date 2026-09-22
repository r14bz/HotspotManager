import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { uploadHotspotFiles } from "@/lib/hotspot-ftp"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_ZIP_BYTES = 100 * 1024 * 1024 // 100 MB
const MAX_FILES = 2000

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(
      { success: false, message: "Body request tidak valid (harus multipart/form-data)" },
      { status: 400 }
    )
  }

  const routerId = form.get("router_id")
  const folder = (form.get("folder") as string) || "hotspot"
  const file = form.get("file")

  if (!routerId || typeof routerId !== "string") {
    return NextResponse.json(
      { success: false, message: "router_id wajib disertakan" },
      { status: 400 }
    )
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, message: "File .zip wajib diunggah (field \"file\")" },
      { status: 400 }
    )
  }
  if (file.size > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { success: false, message: "Ukuran file .zip melebihi batas 100MB" },
      { status: 400 }
    )
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(buffer)
    } catch {
      return NextResponse.json(
        { success: false, message: "File yang diunggah bukan .zip yang valid" },
        { status: 400 }
      )
    }

    const files: { path: string; data: Buffer }[] = []
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      const path = entry.name
      const baseName = path.split("/").pop() || ""
      // Lewati file sampah yang biasa ikut kebawa saat kompres di
      // macOS/Windows Explorer.
      if (path.startsWith("__MACOSX/") || baseName === ".DS_Store" || baseName === "Thumbs.db") {
        continue
      }
      files.push({ path, data: await entry.async("nodebuffer") })
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, message: "File .zip kosong / tidak berisi file yang bisa diupload" },
        { status: 400 }
      )
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, message: `Zip berisi ${files.length} file, melebihi batas ${MAX_FILES}` },
        { status: 400 }
      )
    }

    const result = await uploadHotspotFiles(routerId, folder, files)

    return NextResponse.json({
      success: result.uploaded.length > 0,
      folder,
      totalInZip: files.length,
      ...result,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Gagal mengupload folder" },
      { status: 500 }
    )
  }
}
