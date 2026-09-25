-- Tabel pengaturan aplikasi (single-row / singleton).
-- Menggantikan localStorage supaya harga & identitas brand bisa
-- dibaca oleh server (API routes), bukan cuma di browser admin.

create table if not exists app_settings (
  id smallint primary key default 1,
  brand_name text not null default 'MAMANAIY.NET',
  wa_number text not null default '085212551180',
  wifi_name text not null default 'MAMANAIY.NET',
  prices jsonb not null default '{
    "2jam/2k": 2000,
    "5jam/3rb": 3000,
    "10jam/5rb": 5000,
    "24jam/10rb": 10000,
    "MINGGUAN": 30000,
    "BULANAN": 50000,
    "TRIAL-USER": 0,
    "default": 0
  }'::jsonb,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into app_settings (id) values (1)
on conflict (id) do nothing;

-- Matikan RLS untuk app_settings — konsisten dengan tabel vouchers yang
-- juga tidak pakai RLS. Keamanan akses aplikasi ini sepenuhnya dari
-- login admin (cookie session), bukan dari Supabase Auth/RLS.
alter table app_settings disable row level security;
