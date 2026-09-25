-- Pencatatan percobaan login GAGAL per IP, untuk rate limit login.
-- Aplikasi mengizinkan 5 kegagalan per IP dalam 15 menit; setelah itu
-- login ditolak (HTTP 429) sampai jendela waktunya lewat.
-- JALANKAN SQL INI DULU di Supabase SQL Editor, BARU deploy kodenya.
-- (Kalau tabel belum ada, login tetap jalan tapi TANPA rate limit.)
create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_created_idx
  on public.login_attempts (ip, created_at desc);

-- Kunci seperti tabel lain (lihat 006): RLS aktif tanpa policy, hanya
-- service role (server) yang bisa akses.
alter table public.login_attempts enable row level security;
