import { RouterOSAPI } from 'node-routeros'
import { createClient } from '@/lib/supabase/server'

export type RouterConfig = {
  id: string
  host: string
  port: number
  user: string
  password: string
}

// Kredensial MikroTik sekarang disimpan per-router di Supabase (tabel
// `routers`), BUKAN lagi di environment variables — supaya bisa nambah
// router baru tanpa perlu ubah env var/redeploy.
export async function getRouterConfig(routerId: string): Promise<RouterConfig> {
  if (!routerId) {
    throw new Error('router_id wajib disertakan')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('routers')
    .select('id, host, port, username, password')
    .eq('id', routerId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Router tidak ditemukan')
  }

  return {
    id: data.id,
    host: data.host,
    port: data.port || 8728,
    user: data.username,
    password: data.password,
  }
}

export class MikrotikTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MikrotikTimeoutError"
  }
}

// Batasi lama menunggu sebuah promise. Tanpa ini, perintah RouterOS yang
// tidak pernah dijawab (koneksi macet / router lambat) membuat fungsi Vercel
// menggantung sampai dipotong paksa (504 berisi teks biasa, bukan JSON).
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new MikrotikTimeoutError(`${label} tidak merespons dalam ${Math.round(ms / 1000)} detik`)),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function safeClose(conn: { close: () => unknown }) {
  try {
    const r: any = conn.close()
    if (r && typeof r.catch === "function") r.catch(() => {})
  } catch {
    // sudah ditutup / koneksi terputus, aman diabaikan
  }
}

export async function getMikrotikConnection(routerId: string, timeoutOverride?: number) {
  const config = await getRouterConfig(routerId)
  const conn = new RouterOSAPI({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    timeout: timeoutOverride || 15,
  })
  try {
    await withTimeout(conn.connect(), 20_000, "Koneksi ke MikroTik")
  } catch (e) {
    safeClose(conn)
    throw e
  }
  return conn
}

// Jalankan satu atau beberapa perintah dalam satu koneksi, lalu selalu ditutup.
export async function withMikrotik<T>(
  routerId: string,
  fn: (conn: Awaited<ReturnType<typeof getMikrotikConnection>>) => Promise<T>,
  timeoutOverride?: number,
  // Batas total untuk seluruh isi fn (ms). Kosong = tanpa batas (perilaku lama).
  deadlineMs?: number
): Promise<T> {
  const conn = await getMikrotikConnection(routerId, timeoutOverride)
  try {
    const run = fn(conn)
    return deadlineMs ? await withTimeout(run, deadlineMs, "MikroTik") : await run
  } finally {
    safeClose(conn)
  }
}
