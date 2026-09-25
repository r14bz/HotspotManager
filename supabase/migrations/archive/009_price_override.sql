-- Penanda harga yang diedit manual per voucher (pengecualian khusus).
-- Voucher dengan price_override = true TIDAK ikut berubah saat sync,
-- meskipun harga profile di Pengaturan berubah.
-- JALANKAN SQL INI DULU di Supabase SQL Editor, BARU deploy kodenya
-- (kalau urutannya terbalik, sync dan edit harga akan error sampai
-- kolom ini ada).
alter table public.vouchers
  add column if not exists price_override boolean not null default false;
