"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { defaultSettings } from "@/lib/settings"

type Voucher = {
  username: string
  price: number
  validity?: string
  timelimit?: string
  datalimit?: string
}

export default function PrintPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [brandName, setBrandName] = useState(defaultSettings.brandName)
  const [waNumber, setWaNumber] = useState(defaultSettings.waNumber)

  useEffect(() => {
    const loadBrand = async () => {
      const routerId = localStorage.getItem("active_router_id")
      if (!routerId) return
      try {
        const res = await fetch(`/api/settings?router_id=${routerId}`)
        const json = await res.json()
        if (json.success && json.data) {
          setBrandName(json.data.brandName || defaultSettings.brandName)
          setWaNumber(json.data.waNumber || defaultSettings.waNumber)
        }
      } catch {
        // pakai default
      }
    }
    loadBrand()

    const saved = localStorage.getItem("print_vouchers")
    if (saved) {
      try {
        setVouchers(JSON.parse(saved))
      } catch (e) {
        console.error("Gagal parse data voucher")
      }
    }
  }, [])

  const getColor = (price: number) => {
    if (price === 0) return "#6B7280"
    if (price === 2000) return "#A855F7"
    if (price === 3000) return "#2563EB"
    if (price === 5000) return "#F97316"
    if (price === 10000) return "#F59E0B"
    if (price === 30000) return "#22C55E"
    if (price === 50000) return "#EF4444"
    return "#8B5CF6"
  }

  const formatDurasi = (v: Voucher) => {
    const val = v.timelimit || v.validity || ""
    if (!val) return "-"
    if (val.indexOf("Hari") >= 0 || val.indexOf("Jam") >= 0 || val.indexOf("Menit") >= 0) {
      return val
    }
    if (val.endsWith("d")) return val.slice(0, -1) + " Hari"
    if (val.endsWith("h")) return val.slice(0, -1) + " Jam"
    if (val.endsWith("w")) return String(Number(val.slice(0, -1)) * 7) + " Hari"
    return val
  }

  const currentDate = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div>
      <div className="no-print p-4 bg-paper flex items-center gap-3 sticky top-0 border-b border-line">
        <button
          onClick={() => window.print()}
          className="bg-signal hover:bg-signal-dark text-signal-on px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Print Voucher
        </button>
        <button
          onClick={() => window.history.back()}
          className="bg-surface border border-line hover:border-signal/40 text-text-primary px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Kembali
        </button>
        <span className="text-xs text-text-muted ml-auto hidden sm:inline">
          {vouchers.length} voucher siap dicetak
        </span>
      </div>

      <div className="print-area p-2">
        <div className="flex flex-wrap gap-2">
          {vouchers.length === 0 ? (
            <p className="text-gray-400 text-sm">Tidak ada data voucher untuk di-print.</p>
          ) : (
            vouchers.map((v, idx) => {
              const color = getColor(v.price || 0)

              return (
                <div
                  key={idx}
                  style={{
                    display: "inline-flex",
                    width: "250px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    fontFamily: "Tahoma, Arial, sans-serif",
                    background: "#fff",
                    border: "1px solid #ddd",
                    pageBreakInside: "avoid",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      backgroundColor: color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      fontSize: "11px",
                      fontWeight: "bold",
                      letterSpacing: "0.5px",
                      WebkitPrintColorAdjust: "exact",
                      printColorAdjust: "exact",
                    }}
                  >
                    {"Rp" + (v.price || 0).toLocaleString("id-ID")}
                  </div>

                  <div style={{ flex: 1, padding: "8px 10px" }}>
                    {brandName.trim().toLowerCase() === "mamanaiy.net" ? (
                      <img
                        src="/logo/mamanaiy-wordmark.png"
                        alt={brandName}
                        style={{ height: "34px", marginBottom: "4px", display: "block" }}
                      />
                    ) : (
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "12px",
                          color: "#15803D",
                          marginBottom: "3px",
                        }}
                      >
                        {brandName}
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: "7px",
                        color: "#888",
                        letterSpacing: "0.5px",
                      }}
                    >
                      KODE VOUCHER
                    </div>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: "bold",
                        color: "#111",
                        letterSpacing: "0.5px",
                        marginBottom: "4px",
                      }}
                    >
                      {v.username}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#333",
                            fontWeight: "bold",
                            marginBottom: "3px",
                          }}
                        >
                          {formatDurasi(v)}
                        </div>
                        <div
                          style={{
                            fontSize: "8px",
                            color: "#555",
                            fontWeight: "bold",
                          }}
                        >
                          {"WA : " + waNumber}
                        </div>
                        <div
                          style={{
                            fontSize: "7px",
                            color: "#999",
                            marginTop: "1px",
                          }}
                        >
                          {currentDate}
                        </div>
                      </div>

                      <div
                        style={{
                          width: "42px",
                          height: "42px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <QRCodeSVG
                          value={v.username}
                          size={40}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  )
}
