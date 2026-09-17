// Pemetaan nama profile MikroTik -> label durasi yang ditampilkan di
// voucher cetak. Dipakai bersama oleh route generate (server) dan halaman
// Kelola Voucher (client), supaya labelnya konsisten di mana pun voucher
// itu dicetak — tidak bisa mengandalkan `limit-uptime` per-user di
// MikroTik karena durasi voucher diatur lewat profile (session-timeout),
// bukan per-user.
export const DURATION_MAP: Record<string, string> = {
  "2jam/2k": "2 Jam",
  "5jam/3rb": "5 Jam",
  "10jam/5rb": "10 Jam",
  "24jam/10rb": "1 Hari",
  "MINGGUAN": "7 Hari",
  "BULANAN": "30 Hari",
  "TRIAL-USER": "2 Menit",
  "default": "-",
}

export function getDurationLabel(profileName: string): string {
  if (!profileName) return "-"
  return DURATION_MAP[profileName] || profileName
}
