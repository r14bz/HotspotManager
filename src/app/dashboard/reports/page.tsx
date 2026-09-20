"use client"

import { useEffect, useState, Fragment } from "react"
import { useActiveRouter } from "@/lib/router-context"
import AccordionCard from "@/components/AccordionCard"
import { buildReportXlsx, buildReportCsv, reportFileName } from "@/lib/report-export"
import {
  BarChart3,
  DollarSign,
  Ticket,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
} from "lucide-react"

function getCurrentMonth() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const mm = m < 10 ? "0" + m : "" + m
  return y + "-" + mm
}

function buildMonthOptions() {
  const options = []
  const now = new Date()

  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const mm = m < 10 ? "0" + m : "" + m
    const value = y + "-" + mm
    const label = d.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    })
    options.push({ value: value, label: label })
  }

  return options
}

function formatTimeLabel(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

function formatDateLabel(value: string) {
  if (!value || value.length < 8) return value
  const parts = value.split("-")
  if (parts.length !== 3) return value

  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  if (!year || !month || !day) return value

  const d = new Date(year, month - 1, day)
  if (isNaN(d.getTime())) return value

  return d.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function ReportsPage() {
  const { activeRouterId, activeRouter } = useActiveRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(getCurrentMonth)
  const [monthOptions] = useState(buildMonthOptions)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [profileCardOpen, setProfileCardOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const fetchReport = async (m: string) => {
    if (!activeRouterId) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/reports/sales?month=${encodeURIComponent(m)}&router_id=${activeRouterId}`
      )
      const json = await res.json()

      if (json.success) {
        setData(json)
      } else {
        setError(json.message || "Gagal memuat laporan")
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport(month)
  }, [month, activeRouterId])

  const summary = data?.summary || {}
  const byProfile = data?.byProfile || {}
  const byDate = data?.byDate || {}

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

  // Excel (.xlsx): laporan tertata (ringkasan, per tanggal, detail voucher).
  // CSV: satu baris per voucher terjual, kolom bersih untuk diolah sendiri.
  const handleExport = (kind: "xlsx" | "csv") => {
    setExportOpen(false)

    if (!data) {
      alert("Belum ada data untuk diexport")
      return
    }

    const input = {
      month,
      routerName: activeRouter?.name,
      summary,
      byProfile,
      byDate,
    }

    try {
      if (kind === "xlsx") {
        const bytes = buildReportXlsx(input)
        downloadBlob(
          new Blob([bytes], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          reportFileName(month, "xlsx")
        )
      } else {
        downloadBlob(
          new Blob([buildReportCsv(input)], { type: "text/csv;charset=utf-8;" }),
          reportFileName(month, "csv")
        )
      }
    } catch (err: any) {
      alert("Gagal membuat file: " + (err?.message || "error"))
    }
  }

  const handleImportMikhmon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    try {
      const form = new FormData()
      form.append("file", file)
      form.append("router_id", activeRouterId || "")

      const res = await fetch("/api/reports/import-mikhmon", {
        method: "POST",
        body: form,
      })

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        const text = await res.text()
        console.error("Non-JSON response:", text.slice(0, 300))
        setImportResult(
          "Gagal: API import tidak ditemukan atau error server (status " +
            res.status +
            "). Pastikan file route sudah di-deploy."
        )
        return
      }

      const json = await res.json()

      if (json.success) {
        setImportResult(
          "Berhasil import " +
            json.inserted +
            " dari " +
            json.totalParsed +
            " baris" +
            (json.errorCount ? " (" + json.errorCount + " error)" : "")
        )
        fetchReport(month)
      } else {
        setImportResult("Gagal: " + (json.message || "unknown"))
      }
    } catch (err: any) {
      setImportResult("Error: " + (err.message || "gagal upload"))
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  const statCards = [
    { label: "Total Generate", value: summary.totalGenerated || 0, icon: Ticket, mono: true },
    { label: "Sudah Dipakai", value: summary.totalUsed || 0, icon: CheckCircle, mono: true },
    { label: "Belum Dipakai", value: summary.totalUnused || 0, icon: Clock, mono: true },
    {
      label: "Pendapatan",
      value: "Rp " + (summary.totalRevenue || 0).toLocaleString("id-ID"),
      icon: DollarSign,
      mono: true,
      highlight: true,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-line rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal flex-1 sm:flex-none"
        >
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchReport(month)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-surface border border-line hover:border-signal/40 disabled:opacity-60 text-text-primary px-3 py-2 rounded-lg text-sm flex-shrink-0"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="relative flex-shrink-0">
            <button
              onClick={() => setExportOpen((v) => !v)}
              disabled={!data}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className="flex items-center gap-1.5 bg-signal hover:bg-signal-dark disabled:opacity-50 text-signal-on px-3 py-2 rounded-lg text-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1.5 z-20 w-60 bg-surface border border-line rounded-xl shadow-lg overflow-hidden"
                >
                  <button
                    role="menuitem"
                    onClick={() => handleExport("xlsx")}
                    className="w-full text-left px-4 py-3 hover:bg-paper border-b border-line"
                  >
                    <span className="block text-sm font-medium text-text-primary">
                      Excel (.xlsx)
                    </span>
                    <span className="block text-xs text-text-muted mt-0.5">
                      Rapi: ringkasan, per tanggal, detail voucher
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => handleExport("csv")}
                    className="w-full text-left px-4 py-3 hover:bg-paper"
                  >
                    <span className="block text-sm font-medium text-text-primary">CSV</span>
                    <span className="block text-xs text-text-muted mt-0.5">
                      Satu baris per voucher terjual
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          <label className="flex items-center gap-1.5 bg-ink hover:bg-ink-soft text-white px-3 py-2 rounded-lg text-sm cursor-pointer flex-shrink-0">
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {importing ? "Importing..." : "Import CSV"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importing}
              onChange={handleImportMikhmon}
            />
          </label>
        </div>
      </div>

      {importResult && (
        <div className="bg-signal-soft border border-signal/20 text-signal-dark rounded-xl p-3 text-sm">
          {importResult}
        </div>
      )}

      {error && (
        <div className="bg-danger-soft border border-danger/20 text-danger rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-signal-dark" />
        </div>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {statCards.map((card) => (
                <div
                  key={card.label}
                  className={
                    "rounded-xl border p-4 " +
                    (card.highlight
                      ? "bg-ink border-ink text-white"
                      : "bg-surface border-line")
                  }
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <card.icon
                      className={"w-3.5 h-3.5 " + (card.highlight ? "text-signal" : "text-signal-dark")}
                    />
                    <p className={"text-xs " + (card.highlight ? "text-white/60" : "text-text-secondary")}>
                      {card.label}
                    </p>
                  </div>
                  <p
                    className={
                      "text-xl font-semibold font-mono " +
                      (card.highlight ? "text-white" : "text-text-primary")
                    }
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {Array.isArray(data.excludedProfiles) && data.excludedProfiles.length > 0 && (
              <p className="text-xs text-text-muted -mt-1">
                Tidak dihitung sebagai penjualan: profile {data.excludedProfiles.join(", ")}.
              </p>
            )}

            <AccordionCard
              title="Berdasarkan Profile"
              subtitle={`${Object.keys(byProfile).length} profile`}
              icon={<BarChart3 className="w-4 h-4 text-signal-dark flex-shrink-0" />}
              isOpen={profileCardOpen}
              onToggle={() => setProfileCardOpen((v) => !v)}
            >
              {Object.keys(byProfile).length === 0 ? (
                <p className="text-text-muted text-sm text-center py-6">Belum ada data</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(byProfile).map(([name, info]: any) => (
                    <div
                      key={name}
                      className="flex items-center justify-between py-2 border-b border-line last:border-0"
                    >
                      <div>
                        <p className="font-medium text-text-primary text-sm">{name}</p>
                        <p className="text-xs text-text-secondary font-mono">
                          {info.count} generate · {info.used} dipakai
                        </p>
                      </div>
                      <p className="font-mono font-semibold text-signal-dark">
                        Rp {(info.revenue || 0).toLocaleString("id-ID")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </AccordionCard>

            <div className="bg-surface rounded-xl border border-line overflow-hidden">
              <div className="px-5 py-4 border-b border-line">
                <h3 className="font-semibold text-text-primary text-sm">Penjualan per Tanggal</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Berdasarkan tanggal voucher terpakai — tap baris untuk lihat kode vouchernya
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper border-b border-line">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-text-secondary w-8"></th>
                      <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Tanggal</th>
                      <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Terjual</th>
                      <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Pendapatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(byDate).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                          Belum ada voucher terjual bulan ini
                        </td>
                      </tr>
                    ) : (
                      Object.entries(byDate)
                        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                        .map(([date, info]: any) => {
                          const isOpen = expandedDate === date
                          return (
                            <Fragment key={date}>
                              <tr
                                onClick={() => setExpandedDate(isOpen ? null : date)}
                                className="border-b border-line last:border-0 hover:bg-paper/60 cursor-pointer"
                              >
                                <td className="px-4 py-2.5 text-text-muted">
                                  <ChevronRight
                                    className={
                                      "w-3.5 h-3.5 transition-transform duration-300 " +
                                      (isOpen ? "rotate-90" : "")
                                    }
                                  />
                                </td>
                                <td className="px-4 py-2.5 text-text-primary text-xs sm:text-sm">
                                  {formatDateLabel(date)}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-text-secondary">
                                  {info.count}
                                </td>
                                <td className="px-4 py-2.5 font-mono font-medium text-signal-dark">
                                  Rp {(info.revenue || 0).toLocaleString("id-ID")}
                                </td>
                              </tr>
                              <tr className="bg-paper/60 border-b border-line last:border-0">
                                <td colSpan={4} className="p-0">
                                  <div
                                    className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                                  >
                                    <div className="overflow-hidden">
                                      <div className="px-4 py-3 space-y-1.5">
                                        {(info.items || []).map((it: any, idx: number) => (
                                          <div
                                            key={idx}
                                            className="flex items-center justify-between text-xs bg-surface border border-line rounded-lg px-3 py-1.5"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="font-mono font-medium text-text-primary truncate">
                                                {it.username}
                                              </span>
                                              <span className="text-text-muted">{it.profile_name}</span>
                                              {formatTimeLabel(it.used_at) && (
                                                <span className="font-mono text-text-muted flex-shrink-0">
                                                  {formatTimeLabel(it.used_at)}
                                                </span>
                                              )}
                                            </div>
                                            <span className="font-mono text-signal-dark flex-shrink-0">
                                              Rp {(it.price || 0).toLocaleString("id-ID")}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </Fragment>
                          )
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  )
}
