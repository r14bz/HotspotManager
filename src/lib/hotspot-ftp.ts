import { Client as FtpClient } from "basic-ftp"
import { Readable, Writable } from "node:stream"
import { createClient } from "@/lib/supabase/server"
import { withMikrotik } from "@/lib/mikrotik"

// ============================================================
// Download/upload isi folder portal login hotspot (HTML/CSS/gambar).
//
// KENAPA HYBRID (API + FTP)?
// - LIST isi folder: lewat RouterOS API (/file/print) yang sudah
//   terbukti stabil dipakai di seluruh project ini — jauh lebih
//   aman daripada mem-parsing output LIST dari server FTP MikroTik
//   (formatnya tidak standar, gampang meleset di berbagai versi
//   RouterOS).
// - AMBIL/KIRIM ISI FILE: WAJIB lewat FTP, karena RouterOS API tidak
//   punya perintah baca/tulis isi file yang binary-safe (gambar dsb).
// ============================================================

const MAX_FILES = 2000 // batas pengaman jumlah file per folder
const MAX_TOTAL_BYTES = 100 * 1024 * 1024 // 100 MB

export type HotspotFileEntry = {
  path: string // relatif terhadap folder root, pemisah "/"
  isDir: boolean
  size: number
}

function normalizeFolder(folder: string): string {
  const f = String(folder || "hotspot").trim().replace(/^\/+|\/+$/g, "")
  if (!f || /\.\./.test(f) || /[\\]/.test(f)) {
    throw new Error("Nama folder tidak valid")
  }
  return f
}

// ---------- LIST (lewat RouterOS API) ----------

export async function listHotspotFiles(
  routerId: string,
  folder: string
): Promise<{ folder: string; entries: HotspotFileEntry[] }> {
  const cleanFolder = normalizeFolder(folder)
  const prefix = cleanFolder + "/"

  const items = await withMikrotik(routerId, (conn) => conn.write("/file/print"), 20)

  const entries: HotspotFileEntry[] = (items || [])
    .filter((f: any) => typeof f.name === "string" && f.name.startsWith(prefix))
    .map((f: any) => ({
      path: f.name.slice(prefix.length),
      isDir: f.type === "directory" || f.type === "ftp directory",
      size: Number(f.size || 0),
    }))
    .filter((f: HotspotFileEntry) => f.path !== "")
    .sort((a, b) => a.path.localeCompare(b.path))

  return { folder: cleanFolder, entries }
}

// ---------- Koneksi FTP ----------

type FtpConfig = { host: string; port: number; user: string; password: string }

async function getFtpConfig(routerId: string): Promise<FtpConfig> {
  if (!routerId) throw new Error("router_id wajib disertakan")

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("routers")
    .select("host, ftp_port, username, password")
    .eq("id", routerId)
    .maybeSingle()

  if (error || !data) throw new Error("Router tidak ditemukan")

  return {
    host: data.host,
    port: data.ftp_port || 21,
    user: data.username,
    password: data.password,
  }
}

async function withFtp<T>(routerId: string, fn: (client: FtpClient) => Promise<T>): Promise<T> {
  const config = await getFtpConfig(routerId)
  const client = new FtpClient(20000) // timeout 20 detik per perintah
  client.ftp.verbose = false

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: false,
    })
  } catch (err: any) {
    client.close()
    throw new Error(
      "Gagal login FTP ke router. Pastikan service FTP aktif (IP > Services) dan " +
        "user yang dipakai punya policy \"ftp\" (System > Users > Groups). " +
        (err?.message || "")
    )
  }

  try {
    return await fn(client)
  } finally {
    client.close()
  }
}

// Kumpulkan hasil download ke Buffer di memori (tanpa nulis ke disk,
// supaya aman dipakai di lingkungan serverless).
function memoryWritable(): { stream: Writable; result: () => Buffer } {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      cb()
    },
  })
  return { stream, result: () => Buffer.concat(chunks) }
}

// ---------- DOWNLOAD (lewat FTP, dikemas jadi .zip di memori) ----------

export async function downloadHotspotFolder(
  routerId: string,
  folder: string
): Promise<{ folder: string; files: { path: string; data: Buffer }[]; skipped: string[] }> {
  const { folder: cleanFolder, entries } = await listHotspotFiles(routerId, folder)
  const fileEntries = entries.filter((e) => !e.isDir)

  if (fileEntries.length === 0) {
    throw new Error(
      `Folder "${cleanFolder}" kosong atau tidak ditemukan di router. ` +
        "Cek nama folder di IP > Hotspot > Server Profiles > HTML Directory."
    )
  }
  if (fileEntries.length > MAX_FILES) {
    throw new Error(`Folder berisi ${fileEntries.length} file, melebihi batas ${MAX_FILES}.`)
  }

  const totalSize = fileEntries.reduce((sum, e) => sum + e.size, 0)
  if (totalSize > MAX_TOTAL_BYTES) {
    throw new Error("Ukuran folder terlalu besar untuk didownload sekaligus (>100MB).")
  }

  const files: { path: string; data: Buffer }[] = []
  const skipped: string[] = []

  await withFtp(routerId, async (client) => {
    for (const entry of fileEntries) {
      const remotePath = "/" + cleanFolder + "/" + entry.path
      const { stream, result } = memoryWritable()
      try {
        await client.downloadTo(stream, remotePath)
        files.push({ path: entry.path, data: result() })
      } catch (err: any) {
        skipped.push(entry.path + ": " + (err?.message || "gagal diambil"))
      }
    }
  })

  if (files.length === 0) {
    throw new Error("Tidak ada file yang berhasil diambil lewat FTP. " + (skipped[0] || ""))
  }

  return { folder: cleanFolder, files, skipped }
}

// ---------- UPLOAD (lewat FTP) ----------
// Sifatnya MENIMPA/MENAMBAH saja: file yang ada di router tapi TIDAK
// ada di paket upload TIDAK dihapus. Ini disengaja supaya user tidak
// perlu menyertakan file yang tidak diubah, dan tidak berisiko tanpa
// sengaja menghapus file lain di folder yang sama.
export async function uploadHotspotFiles(
  routerId: string,
  folder: string,
  files: { path: string; data: Buffer }[]
): Promise<{ uploaded: string[]; failed: { path: string; message: string }[] }> {
  const cleanFolder = normalizeFolder(folder)
  const uploaded: string[] = []
  const failed: { path: string; message: string }[] = []

  await withFtp(routerId, async (client) => {
    for (const file of files) {
      const relPath = file.path.replace(/^\/+/, "")
      if (!relPath || /\.\./.test(relPath)) {
        failed.push({ path: file.path, message: "Nama file tidak valid" })
        continue
      }

      const segments = relPath.split("/")
      const fileName = segments.pop() as string
      const dirSegments = segments

      try {
        const parentDir = "/" + [cleanFolder, ...dirSegments].join("/")
        // ensureDir pindah ke direktori itu (dibuat dulu kalau belum ada),
        // jadi upload berikutnya cukup pakai nama file relatif.
        await client.ensureDir(parentDir)
        await client.uploadFrom(Readable.from(file.data), fileName)
        uploaded.push(relPath)
      } catch (err: any) {
        failed.push({ path: relPath, message: err?.message || "gagal diupload" })
      }
    }
  })

  return { uploaded, failed }
}
