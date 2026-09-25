-- Geser manual logo voucher (px). Negatif = ke kiri. Dipakai template Klasik.
-- JALANKAN SQL INI DULU di Supabase SQL Editor, BARU deploy kodenya
-- (kalau urutannya terbalik, tombol Simpan Pengaturan akan error
-- sampai kolom ini ada).
alter table public.app_settings
  add column if not exists logo_offset_x integer not null default 0;
