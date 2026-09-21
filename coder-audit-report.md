# CODER — Laporan Audit & Perbaikan

- **Proyek:** MikroTik Hotspot Manager (Next.js 16, Supabase, node-routeros)
- **Tanggal:** 2026-09-21
- **Hasil:** `tsc --noEmit` bersih, `next build --webpack` sukses (32 route), lint 79 error mayoritas gaya (`no-explicit-any`, `set-state-in-effect`).

## Ringkasan

Arsitektur sehat: session token HMAC, proxy auth untuk `/dashboard` & `/api`, RLS aktif tanpa policy (hanya service role), rate limit login, anti-SSRF di logo-proxy, hashing password PBKDF2. Mayoritas bug berada di **logika sync & laporan**, bukan di keamanan.

## Bug yang DITEMUKAN & SUDAH DIPERBAIKI (4)

### BUG-1 (Penting) — Status voucher "terpakai" berubah jadi "unused" lagi → dihitung dobel di laporan
**Lokasi:** `src/lib/sync.ts` (fungsi `syncVouchersFromMikrotik`)
**Alur:** voucher dipakai → user logout → `/ip/hotspot/user/print` mengembalikan `uptime` & `bytes-in/out` kosong → hitung status kembali menghasilkan `"unused"`, padahal `used_at` di database tetap terisi.
**Dampak:**
- Di halaman Laporan, voucher yang sama masuk **dua kali**: sebagai "Terpakai/Pendapatan" (karena `used_at` terisi) DAN sebagai "Belum Dipakai" (karena `status="unused"`). Angka "Belum Dipakai" menggembung & pendapatan tidak konsisten.
- Di halaman Kelola Voucher tampil "Belum Dipakai" untuk voucher yang sudah laku.
**Fix:** status tidak boleh turun dari terpakai → unused jika `wasAlreadyUsed` (guard setelah penentuan status).

### BUG-2 (UX) — Prefill username login "admin" padahal `ADMIN_USERNAME=Admin`
**Lokasi:** `src/app/login/page.tsx`
**Alur:** form login mengetik default `"admin"`, tetapi env default di `.env.local` adalah `"Admin"`. `safeEqual("admin","Admin")` = false → login selalu gagal dengan kredensial default, membingungkan pengguna.
**Fix:** prefill dikosongkan.

### BUG-3 (Data) — Edit harga "sukses palsu" saat voucher belum ada di database
**Lokasi:** `src/app/api/vouchers/update-price/route.ts`
**Alur:** `.update()` supabase-js tanpa `.select()` tidak menghasilkan error walau 0 baris berubah → response `success: true` padahal tidak ada yang diubah; sync berikutnya tetap memakai harga profile.
**Fix:** cek eksistensi baris dulu (`maybeSingle`), balas 404 + pesan ajakan Sync bila tidak ada.

### BUG-4 (Data) — Harga negatif/string bisa masuk lewat `/api/settings`
**Lokasi:** `src/app/api/settings/route.ts` (POST) & `src/app/dashboard/settings/page.tsx`
**Alur:** `prices` dikirim apa adanya; administrator bisa mengetik `-5000` atau teks → tersimpan → `resolvePrice`/sync memakai nilai itu → pendapatan laporan bisa negatif/rusak.
**Fix:** server memaksa tiap harga `Number` finit ≥ 0 (key di-skip bila invalid); input client di-clamp `Math.max(0, …)`.

## Temuan (tidak diperbaiki, risiko rendah — untuk pertimbangan)

1. **`/print` tidak dilindungi proxy** (`src/proxy.ts` matcher hanya `/dashboard` & `/api`). Data voucher di `localStorage` milik browser admin, jadi praktis bocor hanya jika admin memakai komputer publik. Pertimbangkan menambah `/print` ke matcher.
2. **Rate limit login bisa dilewati dengan spoof IP** — `clientIp()` memakai `x-forwarded-for` yang bisa dikontrol klien di luar Vercel. Di Vercel header ini ditimpa, jadi aman saat production di sana.
3. **Laporan terpotong diam-diam di 20.000 baris/bulan** (`MAX_PAGES=20` di `reports/sales`) — flag `truncated` dikirim tapi tidak ditampilkan di UI.
4. **`update-price` di UI**: daftar profile filter halaman Kelola Voucher di-hardcode (`profileOptions`) — profile baru di MikroTik tidak muncul sebagai pilihan filter (cuma grouping).
5. **Lint**: 65× `no-explicit-any`, 6× `exhaustive-deps`, beberapa `set-state-in-effect` (pola hydration guard yang disengaja).

## Keamanan — sudah baik
- Session token HMAC-SHA256 + constant-time compare, cookie `httpOnly` + `SameSite=Lax`.
- Semua tabel RLS aktif tanpa policy; hanya service role key yang lolos.
- `AUTH_SECRET` fail-closed (tidak ada fallback yang bisa ditebak).
- Login: PBKDF2 210k iterasi + rate limit 5 gagal/15 menit/IP.
- logo-proxy memblokir SSRF (IP privat, localhost, `.local`, `.internal`, `redirect:"error"`).
- Kode voucher memakai `randomInt` kriptografis.
- `.env.local` berisi kredensial nyata tapi **tidak ter-track git** (aman).

## Catatan minor desain
- `resolvePrice` cocokkan substring (mis. `TRIAL-USER-2` kena harga `TRIAL-USER`) — disengaja, tapi urutan kunci memengaruhi prioritas kecocokan.
- Voucher lintas bulan (dibuat bulan lalu, terpakai bulan ini) dihitung di "Terpakai/Pendapatan" bulan ini tapi tidak menambah angka "Generate" — konsisten dengan desain laporan berbasis `used_at`.