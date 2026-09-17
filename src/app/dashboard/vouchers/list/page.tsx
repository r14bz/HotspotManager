"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useActiveRouter } from "@/lib/router-context"
import { getDurationLabel } from "@/lib/duration"
import {
  Search,
  Loader2,
  Ticket,
  Trash2,
  Printer,
  CheckSquare,
  Square,
  RefreshCw,
  Ban,
  CheckCircle,
  Pencil,
  Check,
  X,
} from "lucide-react"

type Voucher = {
  id: string
  username: string
  password: string
  profile_name: string
  price: number
  status: string
  limit_uptime?: string
  uptime?: string
  comment?: string
  note?: string | null
}

const statusLabel: Record<string, string> = {
  online: "Online",
  used: "Terpakai",
  disabled: "Nonaktif",
  unused: "Belum Dipakai",
}

const statusClass: Record<string, string> = {
  online: "bg-signal-soft text-signal-dark",
  used: "bg-paper text-text-secondary",
  disabled: "bg-danger-soft text-danger",
  unused: "bg-amber-soft text-amber",
}

export default function VoucherListPage() {
  const router = useRouter()
  const { activeRouterId } = useActiveRouter()
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [profile, setProfile] = useState("all")
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [editingUsername, setEditingUsername] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState("")
  const [savingPrice, setSavingPrice] = useState(false)

  const profileOptions = [
    "2jam/2k",
    "5jam/3rb",
    "10jam/5rb",
    "24jam/10rb",
    "MINGGUAN",
    "BULANAN",
    "TRIAL-USER",
    "default",
  ]

  const fetchVouchers = async () => {
    if (!activeRouterId) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/mikrotik/vouchers?router_id=${activeRouterId}`)
      const json = await res.json()

      if (json.success) {
        let data: Voucher[] = json.data || []

        if (profile !== "all") {
          data = data.filter((v) => v.profile_name === profile)
        }
        if (status !== "all") {
          data = data.filter((v) => v.status === status)
        }
        if (search) {
          const q = search.toLowerCase()
          data = data.filter(
            (v) =>
              v.username.toLowerCase().includes(q) ||
              (v.note || "").toLowerCase().includes(q)
          )
        }

        setVouchers(data)
        setSelected([])
      } else {
        setError(json.message || "Gagal memuat data dari MikroTik")
      }
    } catch (err: any) {
      setError(err.message || "Tidak dapat terhubung ke MikroTik")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVouchers()
  }, [status, profile, activeRouterId])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchVouchers()
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selected.length === vouchers.length) {
      setSelected([])
    } else {
      setSelected(vouchers.map((v) => v.id))
    }
  }

  const getSelectedVouchers = () => {
    return vouchers.filter((v) => selected.includes(v.id))
  }

  const handlePrintSelected = () => {
    const items = getSelectedVouchers()
    if (items.length === 0) {
      alert("Pilih voucher terlebih dahulu")
      return
    }

    const forPrint = items.map((v) => ({
      username: v.username,
      password: v.password,
      profile: v.profile_name,
      price: v.price || 0,
      validity: getDurationLabel(v.profile_name),
      timelimit: getDurationLabel(v.profile_name),
    }))

    localStorage.setItem("print_vouchers", JSON.stringify(forPrint))
    router.push("/print")
  }

  const handlePrintOne = (v: Voucher) => {
    const forPrint = [
      {
        username: v.username,
        password: v.password,
        profile: v.profile_name,
        price: v.price || 0,
        validity: getDurationLabel(v.profile_name),
        timelimit: getDurationLabel(v.profile_name),
      },
    ]
    localStorage.setItem("print_vouchers", JSON.stringify(forPrint))
    router.push("/print")
  }

  const handleDelete = async (ids?: string[]) => {
    const targetIds = ids || selected
    if (targetIds.length === 0) {
      alert("Pilih voucher terlebih dahulu")
      return
    }

    const confirmMsg =
      targetIds.length === 1
        ? "Yakin hapus voucher ini dari MikroTik?"
        : "Yakin hapus " + targetIds.length + " voucher dari MikroTik?"

    if (!confirm(confirmMsg)) return

    setActionLoading(true)

    try {
      const targetVouchers = vouchers.filter((v) => targetIds.includes(v.id))
      const usernames = targetVouchers.map((v) => v.username)

      const res = await fetch("/api/vouchers/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, usernames, router_id: activeRouterId }),
      })

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        alert("Gagal menghapus: respons server tidak valid")
        return
      }

      const json = await res.json()

      if (json.success) {
        alert(json.message || "Berhasil dihapus")
        fetchVouchers()
      } else {
        alert(json.message || "Gagal menghapus")
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan")
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggle = async (v: Voucher) => {
    const willDisable = v.status !== "disabled"
    const msg = willDisable
      ? "Disable voucher " + v.username + "?"
      : "Enable voucher " + v.username + "?"

    if (!confirm(msg)) return

    setActionLoading(true)
    try {
      const res = await fetch("/api/vouchers/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: v.username,
          disabled: willDisable,
          router_id: activeRouterId,
        }),
      })
      const json = await res.json()
      if (json.success) {
        fetchVouchers()
      } else {
        alert(json.message || "Gagal mengubah status")
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan")
    } finally {
      setActionLoading(false)
    }
  }

  const startEditPrice = (v: Voucher) => {
    setEditingUsername(v.username)
    setEditPrice(String(v.price || 0))
  }

  const cancelEditPrice = () => {
    setEditingUsername(null)
    setEditPrice("")
  }

  const saveEditPrice = async (v: Voucher) => {
    const newPrice = Number(editPrice)

    if (!Number.isFinite(newPrice) || newPrice < 0) {
      alert("Harga tidak valid")
      return
    }

    setSavingPrice(true)
    try {
      const res = await fetch("/api/vouchers/update-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: v.username, price: newPrice, router_id: activeRouterId }),
      })
      const json = await res.json()

      if (json.success) {
        setVouchers((prev) =>
          prev.map((item) =>
            item.username === v.username ? { ...item, price: newPrice } : item
          )
        )
        setEditingUsername(null)
        setEditPrice("")
      } else {
        alert(json.message || "Gagal memperbarui harga")
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan")
    } finally {
      setSavingPrice(false)
    }
  }

  const inputClass =
    "border border-line rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"

  const PriceCell = ({ v, align = "left" }: { v: Voucher; align?: "left" | "right" }) => {
    const isEditing = editingUsername === v.username

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            autoFocus
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEditPrice(v)
              if (e.key === "Escape") cancelEditPrice()
            }}
            className="w-20 border border-signal rounded-md px-2 py-1 text-xs font-mono focus:outline-none"
          />
          <button
            onClick={() => saveEditPrice(v)}
            disabled={savingPrice}
            className="p-1 text-signal-dark hover:bg-signal-soft rounded"
            title="Simpan"
          >
            {savingPrice ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={cancelEditPrice}
            disabled={savingPrice}
            className="p-1 text-text-muted hover:bg-paper rounded"
            title="Batal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )
    }

    return (
      <button
        onClick={() => startEditPrice(v)}
        className={
          "group flex items-center gap-1 font-mono " +
          (align === "right" ? "justify-end" : "")
        }
        title="Klik untuk edit harga"
      >
        <span className="text-text-secondary">
          {v.price ? "Rp" + v.price.toLocaleString("id-ID") : "Gratis"}
        </span>
        <Pencil className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100" />
      </button>
    )
  }

  const ActionButtons = ({ v }: { v: Voucher }) => (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handlePrintOne(v)}
        className="p-1.5 text-text-secondary hover:bg-paper rounded-md"
        title="Print"
      >
        <Printer className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleToggle(v)}
        disabled={actionLoading}
        className={
          "p-1.5 rounded-md " +
          (v.status === "disabled"
            ? "text-signal-dark hover:bg-signal-soft"
            : "text-amber hover:bg-amber-soft")
        }
        title={v.status === "disabled" ? "Enable" : "Disable"}
      >
        {v.status === "disabled" ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <Ban className="w-4 h-4" />
        )}
      </button>
      <button
        onClick={() => handleDelete([v.id])}
        disabled={actionLoading}
        className="p-1.5 text-danger hover:bg-danger-soft rounded-md"
        title="Hapus"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">Data langsung dari MikroTik</p>
        <button
          onClick={fetchVouchers}
          disabled={loading}
          className="flex items-center gap-1.5 bg-signal hover:bg-signal-dark disabled:opacity-60 text-signal-on px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Sync
        </button>
      </div>

      <div className="bg-surface rounded-xl border border-line p-4 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari username atau keterangan..."
              className={`${inputClass} w-full pl-9`}
            />
          </div>
          <button
            type="submit"
            className="bg-ink hover:bg-ink-soft text-white px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0"
          >
            Cari
          </button>
        </form>

        <div className="flex gap-2">
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            className={`${inputClass} flex-1 min-w-0`}
          >
            <option value="all">Semua Profile</option>
            {profileOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`${inputClass} flex-1 min-w-0`}
          >
            <option value="all">Semua Status</option>
            <option value="unused">Belum Dipakai</option>
            <option value="used">Terpakai</option>
            <option value="online">Online</option>
            <option value="disabled">Nonaktif</option>
          </select>
        </div>

        {selected.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-line">
            <span className="text-sm text-text-secondary">
              <span className="font-mono">{selected.length}</span> dipilih
            </span>
            <button
              onClick={handlePrintSelected}
              disabled={actionLoading}
              className="flex items-center gap-1.5 bg-ink hover:bg-ink-soft text-white px-3 py-1.5 rounded-lg text-sm"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={() => handleDelete()}
              disabled={actionLoading}
              className="flex items-center gap-1.5 bg-danger hover:opacity-90 text-white px-3 py-1.5 rounded-lg text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Hapus
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-paper border-b border-line">
              <tr>
                <th className="px-3 py-3 w-10">
                  <button onClick={toggleSelectAll} className="text-text-muted">
                    {selected.length === vouchers.length && vouchers.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-signal-dark" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="text-left px-3 py-3 font-medium text-text-secondary">Username</th>
                <th className="text-left px-3 py-3 font-medium text-text-secondary">Profile</th>
                <th className="text-left px-3 py-3 font-medium text-text-secondary">Harga</th>
                <th className="text-left px-3 py-3 font-medium text-text-secondary">Status</th>
                <th className="text-left px-3 py-3 font-medium text-text-secondary">Uptime</th>
                <th className="text-right px-3 py-3 font-medium text-text-secondary">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Mengambil data dari MikroTik...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-danger">
                    {error}
                  </td>
                </tr>
              ) : vouchers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-text-muted">
                    <Ticket className="w-7 h-7 mx-auto mb-2 opacity-40" />
                    Tidak ada voucher di MikroTik
                  </td>
                </tr>
              ) : (
                vouchers.map((v) => (
                  <tr key={v.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="px-3 py-3">
                      <button onClick={() => toggleSelect(v.id)}>
                        {selected.includes(v.id) ? (
                          <CheckSquare className="w-4 h-4 text-signal-dark" />
                        ) : (
                          <Square className="w-4 h-4 text-text-muted" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono font-medium text-text-primary">{v.username}</div>
                      {v.note ? (
                        <div className="text-xs text-text-muted truncate max-w-[160px]">{v.note}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{v.profile_name}</td>
                    <td className="px-3 py-3">
                      <PriceCell v={v} />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          "inline-block px-2.5 py-0.5 rounded-full text-xs font-medium " +
                          (statusClass[v.status] || "bg-paper text-text-secondary")
                        }
                      >
                        {statusLabel[v.status] || v.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-text-muted text-xs">{v.uptime || "-"}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end">
                        <ActionButtons v={v} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden">
          {loading ? (
            <div className="px-4 py-12 text-center text-text-muted text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Mengambil data dari MikroTik...
            </div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-danger text-sm">{error}</div>
          ) : vouchers.length === 0 ? (
            <div className="px-4 py-12 text-center text-text-muted text-sm">
              <Ticket className="w-7 h-7 mx-auto mb-2 opacity-40" />
              Tidak ada voucher di MikroTik
            </div>
          ) : (
            <>
              <button
                onClick={toggleSelectAll}
                className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-line text-xs text-text-secondary"
              >
                {selected.length === vouchers.length && vouchers.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-signal-dark" />
                ) : (
                  <Square className="w-4 h-4 text-text-muted" />
                )}
                Pilih semua
              </button>
              <div className="divide-y divide-line">
                {vouchers.map((v) => (
                  <div key={v.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleSelect(v.id)} className="mt-0.5 flex-shrink-0">
                        {selected.includes(v.id) ? (
                          <CheckSquare className="w-4 h-4 text-signal-dark" />
                        ) : (
                          <Square className="w-4 h-4 text-text-muted" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-medium text-text-primary text-sm truncate">
                            {v.username}
                          </span>
                          <span
                            className={
                              "flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium " +
                              (statusClass[v.status] || "bg-paper text-text-secondary")
                            }
                          >
                            {statusLabel[v.status] || v.status}
                          </span>
                        </div>
                        {v.note ? (
                          <div className="text-xs text-text-muted truncate mt-0.5">{v.note}</div>
                        ) : null}
                        <div className="flex items-center justify-between text-xs text-text-secondary mt-1">
                          <span>{v.profile_name}</span>
                          <PriceCell v={v} align="right" />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-[11px] text-text-muted">
                            {v.uptime ? "up " + v.uptime : "-"}
                          </span>
                          <ActionButtons v={v} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
