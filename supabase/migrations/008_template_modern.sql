-- Template "struk" diganti dengan "modern".
-- JALANKAN SQL INI DULU di Supabase SQL Editor, BARU deploy kodenya
-- (kalau urutannya terbalik, menyimpan template "Modern" akan ditolak
-- database sampai constraint di bawah diperbarui).

-- 1) Lepas aturan lama yang hanya mengizinkan klasik/tiket/struk
alter table public.app_settings
  drop constraint if exists app_settings_template_check;

-- 2) Router yang sebelumnya memakai "struk" otomatis pindah ke "modern"
update public.app_settings
set voucher_template = 'modern'
where voucher_template = 'struk';

-- 3) Pasang aturan baru
alter table public.app_settings
  add constraint app_settings_template_check
  check (voucher_template in ('klasik', 'tiket', 'modern'));
