"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

export type VoucherTemplate = "klasik" | "tiket" | "modern"

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
  logoOffsetX?: number
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
  logoOffsetX = 0,
  template = "klasik",
  dateLabel,
}: VoucherCardProps) {
  const color = getVoucherColor(voucher.price || 0)
  const scale = (logoSize || 100) / 100

  // Banyak file logo punya area transparan (padding) di sisi kiri, jadi
  // secara visual logo tampak "menjorok" ke kanan dibanding teks di
  // bawahnya. Kita ukur lebar padding kiri itu (lewat canvas) lalu
  // geser logo ke kiri sebesar padding tersebut.
  // Logo dari domain lain diukur lewat /api/logo-proxy (same-origin) supaya
  // canvas tidak terblokir CORS. Kalau pengukuran gagal, tidak ada
  // penggeseran (tampilan tetap normal).
  const [logoPad, setLogoPad] = useState<{ left: number; height: number } | null>(null)

  useEffect(() => {
    setLogoPad(null)
    if (!logoUrl) return

    let cancelled = false
    const probe = new Image()
    probe.onload = () => {
      try {
        const w = probe.naturalWidth
        const h = probe.naturalHeight
        if (!w || !h) return

        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(probe, 0, 0)
        const { data } = ctx.getImageData(0, 0, w, h)

        // Cari kolom paling kiri yang punya piksel tidak transparan
        let left = w
        for (let x = 0; x < w && left === w; x++) {
          for (let y = 0; y < h; y++) {
            if (data[(y * w + x) * 4 + 3] > 16) {
              left = x
              break
            }
          }
        }

        if (!cancelled && left > 0 && left < w) {
          setLogoPad({ left, height: h })
        }
      } catch {
        // canvas "tainted" (CORS) -> abaikan
      }
    }
    // URL absolut (http/https) lewat proxy; path lokal (/logo/...) dan
    // data: URL sudah same-origin, langsung dipakai.
    probe.src = /^https?:\/\//i.test(logoUrl)
      ? "/api/logo-proxy?url=" + encodeURIComponent(logoUrl)
      : logoUrl

    return () => {
      cancelled = true
    }
  }, [logoUrl])
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
          // Rata kiri: tarik logo ke kiri sebesar padding transparannya
          // (sudah dikali skala) supaya sejajar dengan teks di bawahnya.
          // Ditambah geser manual dari Pengaturan (logoOffsetX, px).
          marginLeft:
            align === "left"
              ? `${
                  (logoPad
                    ? -(logoPad.left * (baseHeight / logoPad.height) * scale)
                    : 0) + (logoOffsetX || 0)
                }px`
              : undefined,
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

  // ============ TEMPLATE: MODERN ============
  // Ukuran sama dengan Klasik (lebar 250px). Header berwarna di atas
  // (harga + durasi), kode voucher dalam kotak putus-putus, QR di kanan,
  // footer berisi WA & tanggal.
  if (template === "modern") {
    return (
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 10px",
            backgroundColor: color,
            color: "#fff",
            ...PRINT_COLOR_ADJUST,
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: "bold", letterSpacing: "0.3px" }}>
            {priceLabel}
          </span>
          <span
            style={{
              fontSize: "8px",
              fontWeight: "bold",
              padding: "2px 8px",
              borderRadius: "10px",
              backgroundColor: "rgba(255,255,255,0.25)",
              ...PRINT_COLOR_ADJUST,
            }}
          >
            {durasi}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "7px 10px 6px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Skala logo memakai transform (tidak mengubah tinggi layout),
                jadi saat logo diperbesar diberi ruang ekstra atas-bawah
                supaya tidak menabrak header dan label di bawahnya. */}
            <div
              style={{
                margin: `${logoUrl ? Math.max(0, ((scale - 1) * 14) / 2) : 0}px 0 ${
                  4 + (logoUrl ? Math.max(0, ((scale - 1) * 14) / 2) : 0)
                }px`,
              }}
            >
              <Brand baseHeight={14} textSize="11px" textColor="#15803D" />
            </div>
            <div style={{ fontSize: "7px", color: "#888", letterSpacing: "0.5px", marginBottom: "2px" }}>
              KODE VOUCHER
            </div>
            <div
              style={{
                display: "inline-block",
                padding: "3px 9px",
                borderRadius: "5px",
                border: `1px dashed ${color}`,
                backgroundColor: lightenHex(color, 0.92),
                fontSize: "15px",
                fontWeight: "bold",
                color: "#111",
                letterSpacing: "1.5px",
                ...PRINT_COLOR_ADJUST,
              }}
            >
              {voucher.username}
            </div>
          </div>

          <div
            style={{
              width: "46px",
              height: "46px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <QRCodeSVG value={voucher.username} size={44} level="M" includeMargin={false} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "3px 10px 5px",
            borderTop: "1px solid #eee",
            fontSize: "7px",
            color: "#777",
          }}
        >
          <span style={{ fontWeight: "bold", color: "#555" }}>{"WA : " + waNumber}</span>
          <span>{date}</span>
        </div>
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
