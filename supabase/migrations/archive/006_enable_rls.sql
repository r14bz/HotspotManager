-- ============================================================
-- KUNCI DATABASE DENGAN RLS
--
-- PRASYARAT (WAJIB, urut):
--   1. SUPABASE_SERVICE_ROLE_KEY sudah diset di Vercel
--   2. Kode terbaru (server.ts pakai service role) sudah di-deploy
--   3. Fitur aplikasi sudah dites jalan
-- Kalau SQL ini dijalankan SEBELUM itu, aplikasi akan error.
--
-- Hasil: RLS aktif TANPA policy = anon key ditolak total.
-- Service role key (server) tetap bisa akses karena melewati RLS.
-- ============================================================

-- 1) Hapus SEMUA policy lama di schema public (mis. policy longgar
--    yang bikin peringatan "Policy Exists RLS Disabled").
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I',
      p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 2) Aktifkan RLS di semua tabel yang dipakai aplikasi.
alter table public.vouchers        enable row level security;
alter table public.voucher_batches enable row level security;
alter table public.routers         enable row level security;
alter table public.admin_config    enable row level security;
alter table public.app_settings    enable row level security;

-- Opsional: tabel lama yang tidak dipakai kode (sudah RLS aktif,
-- hanya memastikan). Hapus baris di bawah kalau tabelnya tidak ada.
alter table if exists public.hotspot_profiles enable row level security;
alter table if exists public.sales            enable row level security;

-- ROLLBACK darurat untuk satu tabel (sementara):
--   alter table public.NAMA_TABEL disable row level security;
