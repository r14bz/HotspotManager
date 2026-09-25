-- Port API (kolom `port`, default 8728) dipakai node-routeros untuk
-- perintah konfigurasi (add/remove/set), BUKAN untuk transfer file.
-- Untuk download/upload isi folder portal login hotspot (HTML/CSS/
-- gambar) dipakai FTP, yang di RouterOS jalan di port terpisah
-- (default 21). Disimpan per-router supaya bisa beda kalau di-forward
-- ke port custom lewat VPN/NAT.
alter table routers add column if not exists ftp_port integer not null default 21;
