-- Kolom "Keterangan" opsional per voucher, diisi manual saat generate,
-- dipakai untuk filter di halaman Kelola Voucher.
alter table vouchers add column if not exists note text;
