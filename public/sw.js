// Service worker minimal — cuma supaya app memenuhi syarat "installable"
// sebagai PWA. Sengaja TIDAK melakukan caching apapun, supaya data
// voucher/laporan yang ditampilkan selalu langsung dari server, tidak
// pernah basi/ketinggalan.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", () => {
  // sengaja kosong -> selalu lewat ke jaringan seperti biasa
})
