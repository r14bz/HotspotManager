"use client"

import { QRCodeSVG } from "qrcode.react"

export type VoucherTemplate = "klasik" | "tiket" | "struk"

export type VoucherCardData = {
  username: string
  price: number
  validity?: string
  timelimit?: string
  datalimit?: string
}

export type VoucherCardProps = {
  voucher: VoucherCardData
  brandName: string
  waNumber: string
  logoUrl?: string | null
  logoSize?: number
  template?: VoucherTemplate
  dateLabel?: string
}

export function getVoucherColor(price: number) {
  if (price === 0) return "#6B7280"
  if (price === 2000) return "#A855F7"
  if (price === 3000) return "#2563EB"
  if (price === 5000) return "#F97316"
  if (price === 10000) return "#F59E0B"
  if (price === 30000) return "#22C55E"
  if (price === 50000) return "#EF4444"
  return "#8B5CF6"
}

export function formatDurasi(v: VoucherCardData) {
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

function lightenHex(hex: string, amount = 0.85) {
  const num = parseInt(hex.replace("#", ""), 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

const PRINT_COLOR_ADJUST = {
  WebkitPrintColorAdjust: "exact" as const,
  printColorAdjust: "exact" as const,
}

export default function VoucherCard({
  voucher,
  brandName,
  waNumber,
  logoUrl,
  logoSize = 100,
  template = "klasik",
  dateLabel,
}: VoucherCardProps) {
  const color = getVoucherColor(voucher.price || 0)
  const scale = (logoSize || 100) / 100
  const durasi = formatDurasi(voucher)
  const date =
    dateLabel ||
    new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  const priceLabel = "Rp" + (voucher.price || 0).toLocaleString("id-ID")

  // PENTING: skala logo pakai CSS transform, BUKAN mengubah height asli
  // gambar. Kalau height gambar langsung diubah, box logo ikut membesar
  // dan bisa mendorong lebar kartu (flex item tanpa batas lebar akan
  // "memaksa" parent-nya ikut melebar). transform:scale murni visual,
  // tidak pernah mengubah ukuran tata letak kartu.
  const Brand = ({
    baseHeight,
    textSize,
    textColor,
    align = "left",
  }: {
    baseHeight: number
    textSize: string
    textColor: string
    align?: "left" | "center"
  }) =>
    logoUrl ? (
      <img
        src={logoUrl}
        alt={brandName}
        style={{
          height: `${baseHeight}px`,
          display: "block",
          transform: `scale(${scale})`,
          transformOrigin: align === "center" ? "center" : "left center",
        }}
      />
    ) : (
      <div style={{ fontWeight: "bold", fontSize: textSize, color: textColor }}>{brandName}</div>
    )

  // ============ TEMPLATE: TIKET ============
  if (template === "tiket") {
    return (
      <div
        style={{
          display: "inline-flex",
          width: "250px",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          fontFamily: "Tahoma, Arial, sans-serif",
          background: lightenHex(color, 0.88),
          border: "1px solid #ddd",
          pageBreakInside: "avoid",
          ...PRINT_COLOR_ADJUST,
        }}
      >
        <div style={{ flex: 1, padding: "10px 12px", textAlign: "center" }}>
          <div style={{ marginBottom: "6px", display: "flex", justifyContent: "center" }}>
            <Brand baseHeight={14} textSize="11px" textColor="#15803D" align="center" />
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: "bold",
              color: "#111",
              letterSpacing: "1px",
            }}
          >
            {voucher.username}
          </div>
          <div style={{ fontSize: "8px", color: "#444", marginTop: "4px" }}>
            {durasi} &middot; WA {waNumber}
          </div>
          <div style={{ fontSize: "7px", color: "#777", marginTop: "1px" }}>{date}</div>
        </div>

        <div
          style={{
            width: "1px",
            backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0 5px, transparent 5px 10px)`,
          }}
        />

        <div
          style={{
            width: "62px",
            backgroundColor: color,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            padding: "8px 0",
            ...PRINT_COLOR_ADJUST,
          }}
        >
          <div
            style={{
              width: "34px",
              height: "34px",
              background: "#fff",
              borderRadius: "3px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <QRCodeSVG value={voucher.username} size={30} level="M" includeMargin={false} />
          </div>
          <span style={{ fontSize: "10px", fontWeight: "bold", color: "#fff" }}>
            {priceLabel}
          </span>
        </div>
      </div>
    )
  }

  // ============ TEMPLATE: STRUK ============
  if (template === "struk") {
    return (
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          width: "250px",
          borderRadius: "4px",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          fontFamily: "Tahoma, Arial, sans-serif",
          background: "#fff",
          border: `1.5px dashed ${color}`,
          pageBreakInside: "avoid",
          padding: "14px 16px",
          textAlign: "center",
        }}
      >
        <Brand baseHeight={15} textSize="11px" textColor="#111" align="center" />

        <div style={{ width: "100%", borderTop: `1px dashed ${color}`, margin: "9px 0" }} />

        <div style={{ fontSize: "7px", color: "#999", letterSpacing: "1.5px" }}>
          KODE VOUCHER
        </div>
        <div
          style={{
            fontSize: "19px",
            fontWeight: "bold",
            color: "#111",
            letterSpacing: "2px",
            fontFamily: "'Courier New', monospace",
            margin: "3px 0 8px",
          }}
        >
          {voucher.username}
        </div>

        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            marginBottom: "9px",
          }}
        >
          <QRCodeSVG value={voucher.username} size={46} level="M" includeMargin={false} />
        </div>

        <span
          style={{
            display: "inline-block",
            fontSize: "12px",
            fontWeight: "bold",
            color: "#fff",
            backgroundColor: color,
            padding: "3px 14px",
            borderRadius: "3px",
            marginBottom: "9px",
            ...PRINT_COLOR_ADJUST,
          }}
        >
          {priceLabel}
        </span>

        <div style={{ width: "100%", borderTop: `1px dashed ${color}`, margin: "0 0 8px" }} />

        <div style={{ fontSize: "8px", color: "#444" }}>
          {durasi} &middot; WA {waNumber}
        </div>
        <div style={{ fontSize: "7px", color: "#999", marginTop: "2px" }}>{date}</div>
      </div>
    )
  }

  // ============ TEMPLATE: KLASIK (default) ============
  return (
    <div
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
          ...PRINT_COLOR_ADJUST,
        }}
      >
        {priceLabel}
      </div>

      <div style={{ flex: 1, padding: "8px 10px" }}>
        <div style={{ marginBottom: "5px" }}>
          <Brand baseHeight={18} textSize="12px" textColor="#15803D" />
        </div>

        <div style={{ fontSize: "7px", color: "#888", letterSpacing: "0.5px" }}>
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
          {voucher.username}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: "10px", color: "#333", fontWeight: "bold", marginBottom: "3px" }}>
              {durasi}
            </div>
            <div style={{ fontSize: "8px", color: "#555", fontWeight: "bold" }}>
              {"WA : " + waNumber}
            </div>
            <div style={{ fontSize: "7px", color: "#999", marginTop: "1px" }}>{date}</div>
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
            <QRCodeSVG value={voucher.username} size={40} level="M" includeMargin={false} />
          </div>
        </div>
      </div>
    </div>
  )
}
