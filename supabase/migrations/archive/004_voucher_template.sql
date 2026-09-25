-- Tambahan kolom untuk fitur Template Voucher (per router).

alter table app_settings add column if not exists voucher_template text not null default 'klasik';
alter table app_settings add column if not exists logo_url text;
alter table app_settings add column if not exists logo_size integer not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_settings_template_check'
  ) then
    alter table app_settings add constraint app_settings_template_check
      check (voucher_template in ('klasik', 'tiket', 'struk'));
  end if;
end $$;

-- Migrasi otomatis: kalau brand router itu "Mamanaiy.net" dan dia belum
-- punya logo_url, isikan logo wordmark yang sebelumnya di-hardcode di kode
-- (menggantikan logika lama supaya sekarang diatur dari sini saja).
update app_settings
set logo_url = '/logo/mamanaiy-wordmark.png'
where lower(trim(brand_name)) = 'mamanaiy.net' and logo_url is null;
