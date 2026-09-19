// Sumber kebenaran pengaturan aplikasi sekarang ada di Supabase
// (tabel app_settings), bukan localStorage — supaya API route di server
// (generate voucher, sync MikroTik, print) bisa baca harga & identitas
// brand yang SAMA dengan yang diatur admin di halaman Pengaturan.

export type VoucherTemplate = "klasik" | "tiket" | "modern"

export type AppSettings = {
  brandName: string
  waNumber: string
  wifiName: string
  prices: Record<string, number>
  voucherTemplate: VoucherTemplate
  logoUrl: string | null
  logoSize: number
  // Geser manual logo (px, negatif = ke kiri). Dipakai template Klasik & Modern.
  logoOffsetX: number
}

// Dipakai sebagai fallback kalau baris settings belum ada di database,
// atau saat fetch ke /api/settings gagal (mis. offline sesaat).
export const defaultSettings: AppSettings = {
  brandName: "MAMANAIY.NET",
  waNumber: "085212551180",
  wifiName: "MAMANAIY.NET",
  prices: {
    "2jam/2k": 2000,
    "5jam/3rb": 3000,
    "10jam/5rb": 5000,
    "24jam/10rb": 10000,
    "MINGGUAN": 30000,
    "BULANAN": 50000,
    "TRIAL-USER": 0,
    "default": 0,
  },
  voucherTemplate: "klasik",
  logoUrl: null,
  logoSize: 100,
  logoOffsetX: 0,
}

// Cari harga untuk sebuah profile. Exact match dulu, kalau tidak ada
// baru coba cocokkan sebagian nama (mis. profile "TRIAL-USER-2" tetap
// kena harga "TRIAL-USER").
export function resolvePrice(profile: string, prices: Record<string, number>): number {
  if (!profile) return 0
  if (prices[profile] !== undefined) return prices[profile]

  const key = Object.keys(prices).find((k) =>
    profile.toLowerCase().includes(k.toLowerCase())
  )
  return key ? prices[key] : 0
}
