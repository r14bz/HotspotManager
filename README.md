# HotspotManager

Aplikasi web untuk mengelola voucher hotspot MikroTik — generate voucher, monitor user aktif, laporan penjualan, dan pengaturan portal hotspot — dari satu dashboard, untuk **banyak router sekaligus**.

Dibangun dengan Next.js, terhubung ke MikroTik lewat RouterOS API (via VPN), dan pakai Supabase sebagai database.

## Fitur

**Voucher**
- Generate voucher hotspot secara massal, dengan kode & password custom
- Cetak voucher dengan beberapa pilihan template (Klasik, Tiket, Modern), termasuk logo & QR code
- Edit harga per voucher (override manual, tidak tertimpa sync)
- Enable/disable & hapus voucher
- Catatan (note) per voucher

**Multi-router**
- Kelola beberapa MikroTik dalam satu akun, tinggal pindah router aktif dari dashboard
- Kredensial tiap router disimpan di database (Supabase), bukan di environment variable — nambah router baru tidak perlu redeploy

**Monitoring**
- Dashboard resource router: CPU, memory, traffic interface, identity, model routerboard
- Daftar user hotspot yang sedang aktif (real-time)
- File manager untuk folder portal hotspot (upload/download/lihat file login page) lewat FTP — **ada di kode, tapi belum dipakai di production** karena VPN yang dipakai saat ini tidak mendukung port 21

**Laporan**
- Laporan penjualan per tanggal, ringkasan, dan detail per voucher
- Import laporan dari file CSV Mikhmon (untuk menyesuaikan data lama / voucher yang tercatat manual)
- Export laporan ke Excel

**Sinkronisasi**
- Sync otomatis via cron (status voucher, harga, waktu terpakai) berdasarkan polling ke MikroTik
- Fallback baca catatan penjualan dari script on-login Mikhmon (`/system/script`, `comment="mikhmon"`) untuk menangkap voucher yang keburu terhapus dari router oleh scheduler expired-cleanup sebelum sempat ke-sync

**Keamanan**
- Login admin terpisah dari user MikroTik, dengan rate-limit percobaan login
- Row Level Security (RLS) di Supabase

## Tech Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack)
- [Supabase](https://supabase.com) — database & auth backend
- [node-routeros](https://www.npmjs.com/package/node-routeros) — koneksi ke RouterOS API
- Tailwind CSS
- Vercel — hosting & cron job

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Environment Variables

Buat file `.env.local` (jangan pernah di-commit) berisi:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ADMIN_USERNAME=
ADMIN_PASSWORD=
AUTH_SECRET=

# Dipakai untuk autentikasi endpoint /api/cron/sync
# (wajib dikirim sebagai header "Authorization: Bearer <CRON_SECRET>")
CRON_SECRET=
```

Kredensial koneksi ke tiap MikroTik (host, port, username, password) **tidak** disimpan di sini — diatur lewat halaman **Routers** di dashboard, tersimpan di tabel `routers` pada Supabase.

## Database

Struktur tabel & migration ada di `supabase/migrations/`. Jalankan lewat Supabase SQL Editor sesuai urutan nomor file.

- `001_init.sql` — baseline skema lengkap (hasil `pg_dump --schema-only` dari database production), berisi semua tabel dasar (`vouchers`, `routers`, `voucher_batches`, `app_settings`, dll). Cukup untuk provisioning database dari nol, termasuk untuk Supabase Preview Branching.
- File-file migration lama (sebelum konsolidasi ini) disimpan di `supabase/migrations/archive/` sebagai arsip riwayat — sudah "terbungkus" di dalam `001_init.sql`, jadi tidak perlu (dan tidak boleh) dijalankan lagi.
- Migration baru selanjutnya dilanjutkan dari `002_xxx.sql` dst, ditaruh langsung di `supabase/migrations/` (bukan di `archive/`).

## Sinkronisasi dengan MikroTik

Cron job (`vercel.json`) memanggil `/api/cron/sync` secara berkala untuk menarik status voucher dari semua router. Kalau pakai layanan cron eksternal (mis. cron-job.org), pastikan header berikut disertakan:

```
Authorization: Bearer <CRON_SECRET>
```

## Deploy

Project ini di-deploy di [Vercel](https://vercel.com), auto-deploy dari branch `main`.
