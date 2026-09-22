"use client"

import { useEffect, useState } from "react"
import {
  Save,
  Loader2,
  CheckCircle2,
  KeyRound,
  AlertCircle,
  Smartphone,
  User,
  Tag,
  Ticket,
  Globe,
  Download,
  Upload,
  Eye,
} from "lucide-react"
import { defaultSettings, AppSettings, VoucherTemplate } from "@/lib/settings"
import { useActiveRouter } from "@/lib/router-context"
import InstallPwaButton from "@/components/InstallPwaButton"
import AccordionCard from "@/components/AccordionCard"
import VoucherCard from "@/components/VoucherCard"

const TEMPLATE_OPTIONS: { id: VoucherTemplate; label: string }[] = [
  { id: "klasik", label: "Klasik" },
  { id: "tiket", label: "Tiket" },
  { id: "modern", label: "Modern" },
]

export default function SettingsPage() {
  const { activeRouterId, activeRouter } = useActiveRouter()
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [openCard, setOpenCard] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdMessage, setPwdMessage] = useState("")
  const [pwdError, setPwdError] = useState("")

  // --- Portal Login Hotspot: lihat/download/upload isi folder via FTP ---
  const [portalFolder, setPortalFolder] = useState("hotspot")
  const [portalListing, setPortalListing] = useState<{ entries: any[] } | null>(null)
  const [portalListLoading, setPortalListLoading] = useState(false)
  const [portalListError, setPortalListError] = useState("")
  const [portalDownloading, setPortalDownloading] = useState(false)
  const [portalDownloadError, setPortalDownloadError] = useState("")
  const [portalUploadFile, setPortalUploadFile] = useState<File | null>(null)
  const [portalUploading, setPortalUploading] = useState(false)
  const [portalUploadResult, setPortalUploadResult] = useState<any>(null)
  const [portalUploadError, setPortalUploadError] = useState("")

  useEffect(() => {
    if (!activeRouterId) return
    const loadSettings = async () => {
      setLoadingSettings(true)
      setLoadError(false)
      try {
        const res = await fetch(`/api/settings?router_id=${activeRouterId}`)
        const json = await res.json()
        if (json.success) {
          setSettings(json.data)
        } else {
          setLoadError(true)
        }
      } catch (e) {
        setLoadError(true)
      } finally {
        setLoadingSettings(false)
      }
    }
    loadSettings()
  }, [activeRouterId])

  const toggleCard = (id: string) => {
    setOpenCard((prev) => (prev === id ? null : id))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, router_id: activeRouterId }),
      })
      const json = await res.json()

      if (json.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        alert(json.message || "Gagal menyimpan pengaturan")
      }
    } catch (e) {
      alert("Gagal menyimpan pengaturan")
    } finally {
      setSaving(false)
    }
  }

  const updatePrice = (profile: string, value: string) => {
    const num = Math.max(0, Number(value) || 0)
    setSettings((prev) => ({
      ...prev,
      prices: {
        ...prev.prices,
        [profile]: num,
      },
    }))
  }

  const handleChangePassword = async () => {
    setPwdMessage("")
    setPwdError("")

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdError("Semua field password wajib diisi")
      return
    }

    if (newPassword.length < 6) {
      setPwdError("Password baru minimal 6 karakter")
      return
    }

    if (newPassword !== confirmPassword) {
      setPwdError("Konfirmasi password tidak cocok")
      return
    }

    setPwdLoading(true)

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      const json = await res.json()

      if (json.success) {
        setPwdMessage(json.message || "Password berhasil diganti")
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        setPwdError(json.message || "Gagal ganti password")
      }
    } catch (err: any) {
      setPwdError(err.message || "Terjadi kesalahan")
    } finally {
      setPwdLoading(false)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Jangan langsung dicabut: sebagian browser HP butuh waktu memulai unduhan.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleListPortalFolder = async () => {
    if (!activeRouterId) return
    setPortalListLoading(true)
    setPortalListError("")
    setPortalListing(null)

    try {
      const res = await fetch(
        `/api/mikrotik/hotspot-files/list?router_id=${activeRouterId}&folder=${encodeURIComponent(portalFolder)}`
      )
      const json = await res.json()
      if (json.success) {
        setPortalListing(json)
      } else {
        setPortalListError(json.message || "Gagal membaca folder")
      }
    } catch (err: any) {
      setPortalListError(err.message || "Terjadi kesalahan")
    } finally {
      setPortalListLoading(false)
    }
  }

  const handleDownloadPortalFolder = async () => {
    if (!activeRouterId) return
    setPortalDownloading(true)
    setPortalDownloadError("")

    try {
      const res = await fetch(
        `/api/mikrotik/hotspot-files/download?router_id=${activeRouterId}&folder=${encodeURIComponent(portalFolder)}`
      )
      const contentType = res.headers.get("content-type") || ""

      if (!res.ok || contentType.includes("application/json")) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message || "Gagal mendownload folder")
      }

      const skipped = Number(res.headers.get("x-skipped-files") || 0)
      const blob = await res.blob()
      const disposition = res.headers.get("content-disposition") || ""
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : `${portalFolder}.zip`

      downloadBlob(blob, filename)

      if (skipped > 0) {
        setPortalDownloadError(
          `Selesai, tapi ${skipped} file gagal diambil dan tidak ikut masuk ke .zip.`
        )
      }
    } catch (err: any) {
      setPortalDownloadError(err.message || "Terjadi kesalahan")
    } finally {
      setPortalDownloading(false)
    }
  }

  const handleUploadPortalFolder = async () => {
    if (!activeRouterId) return
    if (!portalUploadFile) {
      setPortalUploadError("Pilih file .zip dulu")
      return
    }

    setPortalUploading(true)
    setPortalUploadError("")
    setPortalUploadResult(null)

    try {
      const form = new FormData()
      form.append("router_id", activeRouterId)
      form.append("folder", portalFolder)
      form.append("file", portalUploadFile)

      const res = await fetch("/api/mikrotik/hotspot-files/upload", {
        method: "POST",
        body: form,
      })
      const json = await res.json()

      if (json.uploaded) {
        setPortalUploadResult(json)
        if (json.uploaded.length > 0) setPortalUploadFile(null)
        if (!json.success) {
          setPortalUploadError("Semua file gagal diupload, lihat detail di bawah.")
        }
      } else {
        setPortalUploadError(json.message || "Gagal mengupload")
      }
    } catch (err: any) {
      setPortalUploadError(err.message || "Terjadi kesalahan")
    } finally {
      setPortalUploading(false)
    }
  }

  const inputClass =
    "w-full border border-line rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"
  const labelClass = "block text-sm font-medium text-text-primary mb-1.5"

  const SaveButton = () => (
    <button
      onClick={handleSave}
      disabled={saving}
      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-signal hover:bg-signal-dark disabled:opacity-60 text-signal-on font-medium px-6 py-2.5 rounded-lg transition-colors"
    >
      {saving ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : saved ? (
        <CheckCircle2 className="w-4 h-4" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {saved ? "Tersimpan" : "Simpan Pengaturan"}
    </button>
  )

  const firstProfileKey = Object.keys(settings.prices)[0]
  const sampleVoucher = {
    username: "CONTOH1",
    price: firstProfileKey ? settings.prices[firstProfileKey] : 3000,
    timelimit: "1 Hari",
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {activeRouter && (
        <p className="text-xs text-text-muted">
          Mengatur untuk router:{" "}
          <span className="font-medium text-text-secondary">{activeRouter.name}</span>
        </p>
      )}

      {loadingSettings ? (
        <div className="flex items-center gap-2 text-sm text-text-muted py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Memuat pengaturan...
        </div>
      ) : loadError ? (
        <div className="bg-danger-soft border border-danger/20 text-danger rounded-xl p-3 text-sm">
          Gagal memuat pengaturan dari server, menampilkan nilai default. Perubahan tetap bisa disimpan.
        </div>
      ) : null}

      {/* Identitas */}
      <AccordionCard
        title="Identitas"
        subtitle={settings.brandName}
        icon={<User className="w-4 h-4 text-signal-dark flex-shrink-0" />}
        isOpen={openCard === "identitas"}
        onToggle={() => toggleCard("identitas")}
      >
        <div>
          <label className={labelClass}>Nama Brand</label>
          <input
            type="text"
            value={settings.brandName}
            onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Nama WiFi</label>
          <input
            type="text"
            value={settings.wifiName}
            onChange={(e) => setSettings({ ...settings, wifiName: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Nomor WhatsApp</label>
          <input
            type="text"
            value={settings.waNumber}
            onChange={(e) => setSettings({ ...settings, waNumber: e.target.value })}
            className={`${inputClass} font-mono`}
          />
        </div>

        <SaveButton />
      </AccordionCard>

      {/* Harga Profile */}
      <AccordionCard
        title="Harga Profile"
        subtitle="Dipakai saat generate & print voucher"
        icon={<Tag className="w-4 h-4 text-signal-dark flex-shrink-0" />}
        isOpen={openCard === "harga"}
        onToggle={() => toggleCard("harga")}
      >
        <div className="space-y-2.5">
          {Object.keys(settings.prices).map((profile) => (
            <div
              key={profile}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-line last:border-0"
            >
              <span className="text-sm font-medium text-text-primary font-mono truncate">
                {profile}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0 w-32">
                <span className="text-xs text-text-muted">Rp</span>
                <input
                  type="number"
                  value={settings.prices[profile]}
                  onChange={(e) => updatePrice(profile, e.target.value)}
                  className="w-full border border-line rounded-lg px-2.5 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"
                />
              </div>
            </div>
          ))}
        </div>

        <SaveButton />
      </AccordionCard>

      {/* Template Voucher */}
      <AccordionCard
        title="Template Voucher"
        subtitle={TEMPLATE_OPTIONS.find((t) => t.id === settings.voucherTemplate)?.label}
        icon={<Ticket className="w-4 h-4 text-signal-dark flex-shrink-0" />}
        isOpen={openCard === "template"}
        onToggle={() => toggleCard("template")}
      >
        <div>
          <label className={labelClass}>Pilih Desain</label>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSettings({ ...settings, voucherTemplate: opt.id })}
                className={
                  "rounded-lg border-2 py-2.5 px-2 flex items-center justify-center transition-colors " +
                  (settings.voucherTemplate === opt.id
                    ? "border-signal bg-signal-soft"
                    : "border-line hover:border-signal/40")
                }
              >
                <span
                  className={
                    "text-sm font-medium " +
                    (settings.voucherTemplate === opt.id ? "text-signal-dark" : "text-text-secondary")
                  }
                >
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>URL Logo (opsional)</label>
          <input
            type="text"
            value={settings.logoUrl || ""}
            onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value || null })}
            placeholder="https://... atau kosongkan untuk pakai teks nama brand"
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="text-xs text-text-muted mt-1.5">
            Kosongkan untuk menampilkan nama brand sebagai teks biasa. Upload dari HP menyusul.
          </p>
        </div>

        <div>
          <label className={labelClass}>Ukuran Logo — {settings.logoSize}%</label>
          <input
            type="range"
            min={50}
            max={200}
            step={10}
            value={settings.logoSize}
            onChange={(e) => setSettings({ ...settings, logoSize: Number(e.target.value) })}
            className="w-full accent-signal"
          />
        </div>

        <div>
          <label className={labelClass}>
            Geser Logo — {settings.logoOffsetX > 0 ? "+" : ""}
            {settings.logoOffsetX}px
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, logoOffsetX: Math.max(-40, settings.logoOffsetX - 1) })
              }
              className="w-10 h-10 flex-shrink-0 rounded-lg border border-line text-text-primary text-lg font-medium"
              aria-label="Geser ke kiri 1px"
            >
              −
            </button>
            <input
              type="range"
              min={-40}
              max={40}
              step={1}
              value={settings.logoOffsetX}
              onChange={(e) => setSettings({ ...settings, logoOffsetX: Number(e.target.value) })}
              className="w-full accent-signal"
            />
            <button
              type="button"
              onClick={() =>
                setSettings({ ...settings, logoOffsetX: Math.min(40, settings.logoOffsetX + 1) })
              }
              className="w-10 h-10 flex-shrink-0 rounded-lg border border-line text-text-primary text-lg font-medium"
              aria-label="Geser ke kanan 1px"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setSettings({ ...settings, logoOffsetX: 0 })}
              className="h-10 px-3 flex-shrink-0 rounded-lg border border-line text-text-secondary text-xs"
            >
              Reset
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            Negatif = ke kiri, positif = ke kanan. Berlaku untuk template Klasik dan Modern. Posisi sudah
            disesuaikan otomatis dengan padding logo; pakai ini hanya untuk koreksi tambahan.
          </p>
        </div>

        <div>
          <label className={labelClass}>Preview</label>
          <div className="bg-paper rounded-lg p-4 flex justify-center">
            <VoucherCard
              voucher={sampleVoucher}
              brandName={settings.brandName}
              waNumber={settings.waNumber}
              logoUrl={settings.logoUrl}
              logoSize={settings.logoSize}
              logoOffsetX={settings.logoOffsetX}
              template={settings.voucherTemplate}
              dateLabel="Contoh tanggal"
            />
          </div>
        </div>

        <SaveButton />
      </AccordionCard>

      {/* Portal Login Hotspot */}
      <AccordionCard
        title="Portal Login Hotspot"
        subtitle="Download / upload tampilan halaman login"
        icon={<Globe className="w-4 h-4 text-signal-dark flex-shrink-0" />}
        isOpen={openCard === "portal"}
        onToggle={() => toggleCard("portal")}
      >
        <div className="bg-paper border border-line rounded-lg p-3 text-xs text-text-secondary space-y-1.5">
          <p>
            Mengambil/mengirim isi folder tampilan halaman login hotspot di router
            (HTML, CSS, gambar) lewat FTP — terpisah dari koneksi API biasa.
          </p>
          <p>
            <span className="font-medium text-text-primary">Sebelum dipakai:</span>{" "}
            pastikan service FTP aktif (<span className="font-mono">IP → Services → ftp</span>) dan
            user router ini punya policy <span className="font-mono">ftp</span> (
            <span className="font-mono">System → Users → Groups</span>).
          </p>
        </div>

        <div>
          <label className={labelClass}>Nama Folder</label>
          <input
            type="text"
            value={portalFolder}
            onChange={(e) => setPortalFolder(e.target.value)}
            placeholder="hotspot"
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-text-muted mt-1.5">
            Cek di <span className="font-mono">IP → Hotspot → Server Profiles → HTML Directory</span>{" "}
            kalau tidak yakin namanya (default: <span className="font-mono">hotspot</span>).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleListPortalFolder}
            disabled={portalListLoading || !activeRouterId}
            className="flex-1 flex items-center justify-center gap-2 bg-surface border border-line hover:border-signal/40 disabled:opacity-60 text-text-primary font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            {portalListLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            Lihat Isi Folder
          </button>
          <button
            type="button"
            onClick={handleDownloadPortalFolder}
            disabled={portalDownloading || !activeRouterId}
            className="flex-1 flex items-center justify-center gap-2 bg-signal hover:bg-signal-dark disabled:opacity-60 text-signal-on font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            {portalDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download .zip
          </button>
        </div>

        {portalListError ? (
          <div className="flex items-start gap-2 bg-danger-soft border border-danger/20 text-danger rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {portalListError}
          </div>
        ) : null}

        {portalListing ? (
          <div className="border border-line rounded-lg max-h-56 overflow-y-auto thin-scroll">
            <table className="w-full text-xs">
              <thead className="bg-paper border-b border-line sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-text-secondary">Nama</th>
                  <th className="text-right px-3 py-2 font-medium text-text-secondary">Ukuran</th>
                </tr>
              </thead>
              <tbody>
                {portalListing.entries.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-center text-text-muted">
                      Folder kosong / tidak ditemukan
                    </td>
                  </tr>
                ) : (
                  portalListing.entries.map((e: any) => (
                    <tr key={e.path} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-mono text-text-primary truncate max-w-[220px]">
                        {e.isDir ? "📁 " : ""}
                        {e.path}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-text-muted whitespace-nowrap">
                        {e.isDir ? "-" : `${Math.ceil(e.size / 1024)} KB`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {portalDownloadError ? (
          <div className="flex items-start gap-2 bg-amber-soft border border-amber/20 text-amber rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {portalDownloadError}
          </div>
        ) : null}

        <div className="border-t border-line pt-4">
          <label className={labelClass}>Upload Ulang (.zip)</label>
          <p className="text-xs text-text-muted mb-2">
            File yang namanya sama akan ditimpa. File lain yang sudah ada di router dan TIDAK
            ada di dalam .zip TIDAK akan dihapus.
          </p>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setPortalUploadFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-signal-soft file:text-signal-dark file:text-sm file:font-medium"
          />

          <button
            type="button"
            onClick={handleUploadPortalFolder}
            disabled={portalUploading || !portalUploadFile || !activeRouterId}
            className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 bg-ink hover:bg-ink-soft disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {portalUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload &amp; Timpa
          </button>

          {portalUploadError ? (
            <div className="mt-3 flex items-start gap-2 bg-danger-soft border border-danger/20 text-danger rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {portalUploadError}
            </div>
          ) : null}

          {portalUploadResult ? (
            <div className="mt-3 bg-signal-soft border border-signal/20 text-signal-dark rounded-lg p-3 text-sm space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {portalUploadResult.uploaded.length} dari {portalUploadResult.totalInZip} file di
                dalam zip berhasil diupload
              </p>
              {portalUploadResult.failed?.length > 0 ? (
                <div className="text-danger text-xs mt-1">
                  {portalUploadResult.failed.length} file gagal:
                  <ul className="list-disc list-inside">
                    {portalUploadResult.failed.slice(0, 5).map((f: any) => (
                      <li key={f.path}>
                        {f.path} — {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </AccordionCard>

      {/* Ganti Password */}
      <AccordionCard
        title="Ganti Password Admin"
        icon={<KeyRound className="w-4 h-4 text-signal-dark flex-shrink-0" />}
        isOpen={openCard === "password"}
        onToggle={() => toggleCard("password")}
      >
        <div>
          <label className={labelClass}>Password Lama</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className={labelClass}>Password Baru</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className={labelClass}>Konfirmasi Password Baru</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </div>

        {pwdError ? (
          <div className="flex items-start gap-2 bg-danger-soft border border-danger/20 text-danger rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {pwdError}
          </div>
        ) : null}

        {pwdMessage ? (
          <div className="flex items-start gap-2 bg-signal-soft border border-signal/20 text-signal-dark rounded-lg p-3 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {pwdMessage}
          </div>
        ) : null}

        <button
          onClick={handleChangePassword}
          disabled={pwdLoading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-ink hover:bg-ink-soft disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {pwdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Ganti Password
        </button>
      </AccordionCard>

      {/* Install sebagai Aplikasi (PWA) */}
      <AccordionCard
        title="Install Aplikasi"
        icon={<Smartphone className="w-4 h-4 text-signal-dark flex-shrink-0" />}
        isOpen={openCard === "install"}
        onToggle={() => toggleCard("install")}
      >
        <p className="text-xs text-text-secondary">
          Pasang app ini di HP/laptop supaya bisa dibuka seperti aplikasi biasa —
          ada ikon sendiri, tanpa address bar browser.
        </p>
        <InstallPwaButton />
      </AccordionCard>
    </div>
  )
}
