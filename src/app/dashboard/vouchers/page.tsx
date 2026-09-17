"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Ticket, Loader2, CheckCircle2, AlertCircle, Printer, RefreshCw } from "lucide-react"
import { resolvePrice, defaultSettings } from "@/lib/settings"
import { useActiveRouter } from "@/lib/router-context"

type Profile = {
  name: string
  sessionTimeout?: string
  rateLimit?: string
}

type GeneratedVoucher = {
  username: string
  password: string
  profile: string
  price: number
  validity?: string
  timelimit?: string
  datalimit?: string
}

export default function VouchersPage() {
  const router = useRouter()
  const { activeRouterId } = useActiveRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [profilesError, setProfilesError] = useState<string | null>(null)

  const [quantity, setQuantity] = useState(10)
  const [prefix, setPrefix] = useState("")
  const [note, setNote] = useState("")
  const [profile, setProfile] = useState("")
  const [price, setPrice] = useState(0)
  const [prices, setPrices] = useState<Record<string, number>>(defaultSettings.prices)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    message: string
    count?: number
    vouchers?: GeneratedVoucher[]
  } | null>(null)

  const fetchProfiles = async (priceMap: Record<string, number>) => {
    if (!activeRouterId) return
    setProfilesLoading(true)
    setProfilesError(null)

    try {
      const res = await fetch(`/api/mikrotik/profiles?router_id=${activeRouterId}`)
      const json = await res.json()

      if (json.success) {
        setProfiles(json.data || [])
        if (json.data && json.data.length > 0) {
          const first = json.data[0].name
          setProfile(first)
          setPrice(resolvePrice(first, priceMap))
        }
      } else {
        setProfilesError(json.message || "Gagal memuat profile")
        setProfiles([])
      }
    } catch (err: any) {
      setProfilesError(err.message || "Tidak dapat terhubung ke MikroTik")
      setProfiles([])
    } finally {
      setProfilesLoading(false)
    }
  }

  useEffect(() => {
    if (!activeRouterId) return
    const init = async () => {
      let priceMap = defaultSettings.prices
      try {
        const res = await fetch(`/api/settings?router_id=${activeRouterId}`)
        const json = await res.json()
        if (json.success && json.data?.prices) {
          priceMap = json.data.prices
          setPrices(priceMap)
        }
      } catch {
        // pakai default
      }
      fetchProfiles(priceMap)
    }
    init()
  }, [activeRouterId])

  const handleProfileChange = (name: string) => {
    setProfile(name)
    setPrice(resolvePrice(name, prices))
  }

  const handleGenerate = async () => {
    if (!profile) {
      setResult({ success: false, message: "Pilih profile terlebih dahulu" })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch("/api/vouchers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, prefix, profile, price, note, router_id: activeRouterId }),
      })

      const data = await res.json()
      setResult(data)
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || "Terjadi kesalahan",
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    if (!result?.vouchers || result.vouchers.length === 0) return
    localStorage.setItem("print_vouchers", JSON.stringify(result.vouchers))
    router.push("/print")
  }

  const inputClass =
    "w-full border border-line rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"
  const labelClass = "block text-sm font-medium text-text-primary mb-1.5"

  return (
    <div className="space-y-5 max-w-xl">
      <p className="text-sm text-text-secondary">
        Buat kode voucher massal sesuai profile yang ada di MikroTik.
      </p>

      <div className="bg-surface rounded-xl border border-line p-5">
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClass}>Profile Hotspot</label>
              <button
                type="button"
                onClick={() => fetchProfiles(prices)}
                disabled={profilesLoading}
                className="flex items-center gap-1 text-xs text-signal-dark hover:opacity-70 font-medium"
              >
                <RefreshCw className={"w-3 h-3 " + (profilesLoading ? "animate-spin" : "")} />
                Refresh
              </button>
            </div>

            {profilesLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-muted py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Mengambil profile dari MikroTik...
              </div>
            ) : profilesError ? (
              <div className="bg-danger-soft border border-danger/20 text-danger rounded-lg p-3 text-sm">
                {profilesError}
                <p className="text-xs mt-1 opacity-80">Pastikan MikroTik online, lalu klik Refresh.</p>
              </div>
            ) : profiles.length === 0 ? (
              <div className="bg-amber-soft border border-amber/20 text-amber rounded-lg p-3 text-sm">
                Tidak ada profile hotspot di MikroTik.
              </div>
            ) : (
              <select
                value={profile}
                onChange={(e) => handleProfileChange(e.target.value)}
                className={inputClass}
              >
                <option value="">-- Pilih Profile --</option>
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.sessionTimeout ? " (" + p.sessionTimeout + ")" : ""}
                    {p.rateLimit ? " • " + p.rateLimit : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Jumlah</label>
              <input
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Prefix</label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder="Contoh: VIP"
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Keterangan (Opsional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Titip jual warung Bu Siti"
              maxLength={200}
              className={inputClass}
            />
            <p className="text-xs text-text-muted mt-1.5">
              Buat catatan sendiri, nanti bisa dicari di Kelola Voucher
            </p>
          </div>

          <div>
            <label className={labelClass}>Harga Jual (Rp)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className={`${inputClass} font-mono`}
            />
            <p className="text-xs text-text-muted mt-1.5">
              Otomatis dari Pengaturan (bisa diubah manual)
            </p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !profile || profilesLoading || !!profilesError}
            className="w-full bg-signal hover:bg-signal-dark disabled:opacity-50 text-signal-on font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Ticket className="w-4 h-4" />
                Generate Voucher
              </>
            )}
          </button>

          {result && (
            <div
              className={
                "p-4 rounded-lg text-sm border " +
                (result.success
                  ? "bg-signal-soft text-signal-dark border-signal/20"
                  : "bg-danger-soft text-danger border-danger/20")
              }
            >
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{result.message}</p>
                  {result.count ? (
                    <p className="mt-1">
                      Berhasil membuat <span className="font-mono">{result.count}</span> voucher
                    </p>
                  ) : null}
                </div>
              </div>

              {result.success && result.vouchers ? (
                <button
                  onClick={handlePrint}
                  className="mt-4 w-full bg-signal hover:bg-signal-dark text-signal-on font-medium py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print Voucher ({result.count})
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
