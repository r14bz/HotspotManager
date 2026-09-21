"use client"

import { useEffect, useRef, useState } from "react"
import {
  RefreshCw,
  Loader2,
  Server,
  AlertCircle,
  HardDrive,
  Wifi,
  Users,
  Cpu,
  ChevronDown,
} from "lucide-react"
import { useActiveRouter } from "@/lib/router-context"

export default function DashboardPage() {
  const { activeRouterId } = useActiveRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Log tertutup by default (isinya panjang & jarang dibutuhkan langsung).
  const [logsOpen, setLogsOpen] = useState(false)

  // Sudah pernah menerima data "full" (info statis + log) untuk router ini?
  const hasFull = useRef(false)
  // Cegah dua permintaan menumpuk kalau router sedang lambat menjawab.
  const inFlight = useRef(false)

  // full = true: ikut mengambil info statis + log (lebih berat untuk router).
  // Polling otomatis memakai mode ringan; data lama (identity, log, dst)
  // dipertahankan dan hanya bagian yang berubah yang diperbarui.
  const fetchData = async (full = false) => {
    if (!activeRouterId) return
    if (inFlight.current) return
    inFlight.current = true

    const needFull = full || !hasFull.current
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/mikrotik/dashboard?router_id=${activeRouterId}${needFull ? "&full=1" : ""}`
      )
      const json = await res.json()

      if (json.success) {
        if (needFull) hasFull.current = true
        setData((prev: any) => (needFull || !prev ? json.data : { ...prev, ...json.data }))
      } else {
        setError(json.message || "Gagal mengambil data")
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan")
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    setData(null)
    hasFull.current = false
    inFlight.current = false
    fetchData(true)

    // Polling tiap 60 dtk, dan dilewati saat tab tidak terlihat supaya
    // router tidak terus ditanyai ketika halaman tidak dilihat siapa pun.
    const interval = setInterval(() => {
      if (document.hidden) return
      fetchData(false)
    }, 60000)

    // Begitu tab terlihat lagi, segarkan sekali.
    const onVisible = () => {
      if (!document.hidden) fetchData(false)
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [activeRouterId])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-signal-dark" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Meta row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {data ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="signal-dot absolute inline-flex h-2 w-2 rounded-full bg-signal" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-signal" />
              </span>
              <span className="font-medium text-text-primary truncate">{data.identity}</span>
              <span className="text-text-muted hidden sm:inline">
                · RouterOS {data.version} · up {data.uptime}
              </span>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Menghubungkan ke MikroTik…</p>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className="flex items-center gap-1.5 bg-surface border border-line hover:border-signal/40 disabled:opacity-60 text-text-primary px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 text-danger rounded-xl p-3.5 flex items-start gap-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Gagal terhubung ke MikroTik</p>
            <p className="text-xs mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Row 1: System Info + Resource Usage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl border border-line p-4">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2 text-sm">
                <Server className="w-4 h-4 text-signal-dark" />
                System Info
              </h3>
              <dl className="space-y-2 text-xs">
                {[
                  ["Identity", data.identity],
                  ["Model", data.model],
                  ["RouterOS", data.version],
                  ["Architecture", data.architecture],
                  ["Serial", data.serial],
                  ["Firmware", data.firmware],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-text-secondary">{label}</dt>
                    <dd className="font-mono text-text-primary text-right truncate">{value}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">CPU</dt>
                  <dd className="font-mono text-text-primary text-right">
                    {data.cpuCount} core · {data.cpuFrequency}MHz · {data.cpu}%
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-surface rounded-xl border border-line p-4">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2 text-sm">
                <HardDrive className="w-4 h-4 text-signal-dark" />
                Resource Usage
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-text-secondary">Memory</span>
                    <span className="font-mono text-text-primary">
                      {data.memory?.used} / {data.memory?.total} ({data.memory?.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-paper rounded-full h-1.5">
                    <div
                      className="bg-signal h-1.5 rounded-full transition-all"
                      style={{ width: `${data.memory?.percent || 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-text-secondary">HDD / Storage</span>
                    <span className="font-mono text-text-primary">
                      {data.hdd?.used} / {data.hdd?.total} ({data.hdd?.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-paper rounded-full h-1.5">
                    <div
                      className="bg-amber h-1.5 rounded-full transition-all"
                      style={{ width: `${data.hdd?.percent || 0}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1 text-xs text-text-secondary">
                  <Cpu className="w-3.5 h-3.5" />
                  Uptime <span className="font-mono text-text-primary">{data.uptime}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Traffic + User Online */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl border border-line p-4">
              <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2 text-sm">
                <Wifi className="w-4 h-4 text-signal-dark" />
                Traffic Internet
              </h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Interface</dt>
                  <dd className="font-mono text-text-primary">{data.traffic?.interface}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Download (RX)</dt>
                  <dd className="font-mono text-signal-dark font-medium">{data.traffic?.rx}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Upload (TX)</dt>
                  <dd className="font-mono text-text-primary font-medium">{data.traffic?.tx}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">RX Packets</dt>
                  <dd className="font-mono text-text-primary">{data.traffic?.rxPackets}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">TX Packets</dt>
                  <dd className="font-mono text-text-primary">{data.traffic?.txPackets}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-surface rounded-xl border border-line overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <h3 className="font-semibold text-text-primary flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-signal-dark" />
                  User Online
                </h3>
                <span className="text-xs bg-signal-soft text-signal-dark px-2 py-0.5 rounded-full font-mono font-medium">
                  {data.activeUsers}
                </span>
              </div>
              <div className="p-3 max-h-48 overflow-y-auto thin-scroll">
                {data.users?.length === 0 ? (
                  <p className="text-text-muted text-xs text-center py-6">
                    Tidak ada user online
                  </p>
                ) : (
                  <div className="space-y-1">
                    {data.users.map((u: any, i: number) => (
                      <div
                        key={i}
                        className="flex justify-between items-center text-xs py-1.5 border-b border-line last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-text-primary truncate">{u.user}</p>
                          <p className="text-[10px] font-mono text-text-muted">{u.address}</p>
                        </div>
                        <span className="font-mono text-text-secondary flex-shrink-0 ml-2">
                          {u.uptime}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Logs — bisa di-expand/collapse, tertutup by default */}
          <div className="bg-surface rounded-xl border border-line overflow-hidden">
            <button
              type="button"
              onClick={() => setLogsOpen((v) => !v)}
              aria-expanded={logsOpen}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 border-b border-line text-left"
            >
              <h3 className="font-semibold text-text-primary text-sm">
                Log Terbaru
                {data.logs?.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-text-muted">
                    ({data.logs.length})
                  </span>
                )}
              </h3>
              <ChevronDown
                className={
                  "w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-300 " +
                  (logsOpen ? "rotate-180" : "")
                }
              />
            </button>

            {/* Animasi expand/collapse pakai trik CSS grid (0fr -> 1fr), supaya
                tinggi konten "auto" tetap bisa di-transition mulus tanpa perlu
                mengukur tinggi lewat JS. */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{ gridTemplateRows: logsOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-paper border-b border-line">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-text-secondary w-24">Waktu</th>
                        <th className="text-left px-4 py-2 font-medium text-text-secondary w-28">Topics</th>
                        <th className="text-left px-4 py-2 font-medium text-text-secondary">Pesan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.logs?.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-text-muted">
                            Tidak ada log
                          </td>
                        </tr>
                      ) : (
                        data.logs.map((log: any, i: number) => (
                          <tr key={i} className="border-b border-line last:border-0 hover:bg-paper/60">
                            <td className="px-4 py-2 font-mono text-text-muted whitespace-nowrap">{log.time}</td>
                            <td className="px-4 py-2 font-mono text-signal-dark">{log.topics}</td>
                            <td className="px-4 py-2 text-text-primary">{log.message}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-line">
                  {data.logs?.length === 0 ? (
                    <p className="px-4 py-6 text-center text-text-muted text-xs">Tidak ada log</p>
                  ) : (
                    data.logs.map((log: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-signal-dark">{log.topics}</span>
                          <span className="font-mono text-text-muted">{log.time}</span>
                        </div>
                        <p className="text-text-primary">{log.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
