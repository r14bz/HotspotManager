-- ============================================================
-- MULTI-ROUTER MIGRATION
-- Jalankan di Supabase SQL Editor, DARI ATAS KE BAWAH, satu blok
-- demi satu blok (jangan loncat). Aman dijalankan berkali-kali
-- (pakai IF NOT EXISTS / IF EXISTS di semua tempat).
--
-- SEBELUM MULAI: disarankan export dulu tabel `vouchers` sebagai
-- CSV dari Supabase Table Editor, jaga-jaga.
-- ============================================================

-- 1) Tabel routers — daftar semua MikroTik yang dikelola
create extension if not exists pgcrypto;

create table if not exists routers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host text not null,
  port integer not null default 8728,
  username text not null,
  password text not null,
  local_ip text,              -- opsional, cuma catatan referensi (mis. buat WinBox), TIDAK dipakai app untuk konek
  created_at timestamptz not null default now()
);
alter table routers disable row level security;

-- 2) GANTI BAGIAN INI dengan kredensial MikroTik yang SEKARANG
--    kepakai (yang sekarang ada di Environment Variables Vercel:
--    MIKROTIK_HOST, MIKROTIK_PORT, MIKROTIK_USER, MIKROTIK_PASSWORD).
--    Ini jadi "Router 1" — semua voucher & settings yang sudah ada
--    akan otomatis dikaitkan ke router ini.
insert into routers (name, host, port, username, password, local_ip)
values (
  'GANTI_NAMA_ROUTER_1',          -- contoh: 'Rumah' atau 'Cabang A'
  'GANTI_HOST_VPN_ATAU_IP',       -- isi dari MIKROTIK_HOST sekarang
  8728,                            -- isi dari MIKROTIK_PORT sekarang
  'GANTI_USERNAME_MIKROTIK',
  'GANTI_PASSWORD_MIKROTIK',
  null                              -- opsional: IP lokal router, mis. '192.168.1.1'
)
on conflict do nothing;

-- 3) Tambahkan router kedua kamu di sini juga (edit dulu nilainya)
insert into routers (name, host, port, username, password, local_ip)
values (
  'GANTI_NAMA_ROUTER_2',
  'GANTI_HOST_VPN_ATAU_IP_ROUTER_2',
  8728,
  'GANTI_USERNAME_MIKROTIK_2',
  'GANTI_PASSWORD_MIKROTIK_2',
  null
)
on conflict do nothing;

-- ============================================================
-- STOP DI SINI DULU. Jalankan blok 1-3 di atas, lalu cek tabel
-- `routers` di Table Editor — pastikan 2 baris sudah benar dan
-- catat/lihat `id` (UUID) dari baris "Router 1" (yang lama),
-- karena dipakai di blok berikutnya.
-- ============================================================


-- 4) vouchers: tambah kolom router_id, backfill semua data LAMA
--    ke Router 1, lalu jadikan wajib diisi.
alter table vouchers add column if not exists router_id uuid references routers(id);

update vouchers
set router_id = (select id from routers where name = 'GANTI_NAMA_ROUTER_1' limit 1)
where router_id is null;

alter table vouchers alter column router_id set not null;

-- 5) Ganti aturan unik dari "username saja" jadi "router_id + username"
--    (supaya kode voucher yang sama di router BEDA tidak dianggap
--    data yang sama). Blok ini otomatis cari & hapus constraint unik
--    lama di kolom username, apapun namanya.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'vouchers'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(username)%'
  loop
    execute format('alter table vouchers drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists vouchers_router_username_idx
  on vouchers (router_id, username);

-- 6) app_settings: dari 1 baris global jadi 1 baris PER ROUTER
alter table app_settings add column if not exists router_id uuid references routers(id);

update app_settings
set router_id = (select id from routers where name = 'GANTI_NAMA_ROUTER_1' limit 1)
where router_id is null;

alter table app_settings drop constraint if exists app_settings_singleton;
alter table app_settings alter column id drop default;
create unique index if not exists app_settings_router_idx on app_settings (router_id);

-- Baris settings untuk Router 2 (harga & brand kosong/default dulu,
-- nanti diisi dari halaman Pengaturan di app setelah router aktifnya
-- dipilih)
insert into app_settings (router_id, brand_name, wa_number, wifi_name, prices)
select id, name, '', name, '{
  "2jam/2k": 2000, "5jam/3rb": 3000, "10jam/5rb": 5000,
  "24jam/10rb": 10000, "MINGGUAN": 30000, "BULANAN": 50000,
  "TRIAL-USER": 0, "default": 0
}'::jsonb
from routers
where name = 'GANTI_NAMA_ROUTER_2'
on conflict (router_id) do nothing;

-- 7) voucher_batches (log batch generate) — ikut ditandai router_id juga,
--    supaya konsisten (walau tabel ini cuma log, tidak dipakai laporan).
alter table voucher_batches add column if not exists router_id uuid references routers(id);
update voucher_batches
set router_id = (select id from routers where name = 'GANTI_NAMA_ROUTER_1' limit 1)
where router_id is null;
