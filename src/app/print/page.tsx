"use client"

import { useEffect, useState } from "react"
import { defaultSettings, AppSettings } from "@/lib/settings"
import VoucherCard, { VoucherCardData } from "@/components/VoucherCard"

export default function PrintPage() {
  const [vouchers, setVouchers] = useState<VoucherCardData[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)

  useEffect(() => {
    const loadSettings = async () => {
      const routerId = localStorage.getItem("active_router_id")
      if (!routerId) return
      try {
        const res = await fetch(`/api/settings?router_id=${routerId}`)
        const json = await res.json()
        if (json.success && json.data) {
          setSettings(json.data)
        }
      } catch {
        // pakai default
      }
    }
    loadSettings()

    const saved = localStorage.getItem("print_vouchers")
    if (saved) {
      try {
        setVouchers(JSON.parse(saved))
      } catch (e) {
        console.error("Gagal parse data voucher")
      }
    }
  }, [])

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
            <p className="text-text-muted text-sm">Tidak ada data voucher untuk di-print.</p>
          ) : (
            vouchers.map((v, idx) => (
              <VoucherCard
                key={idx}
                voucher={v}
                brandName={settings.brandName}
                waNumber={settings.waNumber}
                logoUrl={settings.logoUrl}
                logoSize={settings.logoSize}
                logoOffsetX={settings.logoOffsetX}
                template={settings.voucherTemplate}
              />
            ))
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
