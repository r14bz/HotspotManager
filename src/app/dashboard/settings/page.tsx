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
} from "lucide-react"
import { defaultSettings, AppSettings, VoucherTemplate } from "@/lib/settings"
import { useActiveRouter } from "@/lib/router-context"
import InstallPwaButton from "@/components/InstallPwaButton"
import AccordionCard from "@/components/AccordionCard"
import VoucherCard from "@/components/VoucherCard"

const TEMPLATE_OPTIONS: { id: VoucherTemplate; label: string }[] = [
  { id: "klasik", label: "Klasik" },
  { id: "tiket", label: "Tiket" },
  { id: "struk", label: "Struk" },
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
    const num = Number(value) || 0
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
                  "rounded-lg border-2 p-2 flex flex-col items-center gap-1.5 transition-colors " +
                  (settings.voucherTemplate === opt.id
                    ? "border-signal bg-signal-soft"
                    : "border-line hover:border-signal/40")
                }
              >
                <div
                  style={{
                    width: "108px",
                    height: "46px",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      transform: "scale(0.43)",
                      transformOrigin: "top left",
                      pointerEvents: "none",
                    }}
                  >
                    <VoucherCard
                      voucher={sampleVoucher}
                      brandName={settings.brandName}
                      waNumber={settings.waNumber}
                      logoUrl={settings.logoUrl}
                      logoSize={settings.logoSize}
                      template={opt.id}
                      dateLabel="Contoh"
                    />
                  </div>
                </div>
                <span
                  className={
                    "text-xs font-medium " +
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
          <label className={labelClass}>Preview</label>
          <div className="bg-paper rounded-lg p-4 flex justify-center">
            <VoucherCard
              voucher={sampleVoucher}
              brandName={settings.brandName}
              waNumber={settings.waNumber}
              logoUrl={settings.logoUrl}
              logoSize={settings.logoSize}
              template={settings.voucherTemplate}
              dateLabel="Contoh tanggal"
            />
          </div>
        </div>

        <SaveButton />
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
