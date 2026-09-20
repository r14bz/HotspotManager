import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Semua batas bulan & pengelompokan tanggal memakai WIB (UTC+7), sama
// dengan import Mikhmon. Sebelumnya memakai UTC, sehingga voucher yang
// terpakai pukul 00:00-07:00 WIB masuk ke hari/bulan sebelumnya.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const PAGE_SIZE = 1000
const MAX_PAGES = 20 // batas pengaman: 20.000 baris

const pad = (n: number) => String(n).padStart(2, "0")

// Profile yang BUKAN penjualan: akun administrator ("default"), voucher uji
// coba koneksi ("TRIAL-USER"), dan user tanpa profile ("-"). Semuanya
// dikecualikan dari SELURUH angka laporan (generate, terpakai, belum
// dipakai, pendapatan, per profile, per tanggal). Pencocokan tidak
// membedakan huruf besar/kecil.
const NON_SALES_PROFILES = ["default", "TRIAL-USER", "-"]
const NON_SALES_SET = new Set(NON_SALES_PROFILES.map((p) => p.toLowerCase()))

function wibDate(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

type Row = {
  id: string
  username: string
  profile_name: string | null
  price: number | null
  status: string | null
  created_at: string | null
  sold_at: string | null
  used_at: string | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const routerId = searchParams.get("router_id")
    let month = searchParams.get("month") // diharapkan: 2026-09

    if (!routerId) {
      return NextResponse.json(
        { success: false, message: "router_id wajib disertakan" },
        { status: 400 }
      )
    }

    // Validasi format YYYY-MM dan rentang bulan 01-12
    if (month) {
      const mm = Number(month.slice(5, 7))
      if (!/^\d{4}-\d{2}$/.test(month) || mm < 1 || mm > 12) month = null
    }

    // Default: bulan ini menurut WIB
    if (!month) {
      const nowWib = new Date(Date.now() + WIB_OFFSET_MS)
      month = `${nowWib.getUTCFullYear()}-${pad(nowWib.getUTCMonth() + 1)}`
    }

    const [yearStr, monthStr] = month.split("-")
    const year = Number(yearStr)
    const mon = Number(monthStr)
    const nextYear = mon === 12 ? year + 1 : year
    const nextMon = mon === 12 ? 1 : mon + 1

    // Awal & akhir bulan dalam WIB, dikonversi ke ISO UTC untuk query.
    const startDate = new Date(`${month}-01T00:00:00+07:00`)
    const endDate = new Date(`${nextYear}-${pad(nextMon)}-01T00:00:00+07:00`)
    const start = startDate.toISOString()
    const end = endDate.toISOString()

    const supabase = await createClient()

    // Ambil semua halaman (Supabase membatasi 1000 baris per query).
    const allRows: Row[] = []
    let truncated = false

    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, username, profile_name, price, status, created_at, sold_at, used_at")
        .eq("router_id", routerId)
        .or(
          `and(created_at.gte.${start},created_at.lt.${end}),` +
            `and(used_at.gte.${start},used_at.lt.${end})`
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 500 }
        )
      }

      const rows = (data || []) as Row[]
      allRows.push(...rows)

      if (rows.length < PAGE_SIZE) break
      if (page === MAX_PAGES - 1) truncated = true
    }

    // Buang profile non-penjualan. Baris tanpa profile (null) TIDAK dibuang,
    // tetap dihitung sebagai "unknown" seperti sebelumnya.
    const vouchers = allRows.filter(
      (v) => !NON_SALES_SET.has((v.profile_name || "").trim().toLowerCase())
    )

    const startTime = startDate.getTime()
    const endTime = endDate.getTime()

    const inRange = (iso: string | null | undefined) => {
      if (!iso) return false
      const t = new Date(iso).getTime()
      return t >= startTime && t < endTime
    }

    const isUsedFlag = (v: Row) =>
      v.status === "used" || v.status === "online" || !!v.sold_at || !!v.used_at

    const usedDateOf = (v: Row) => v.used_at || v.sold_at || v.created_at

    // "Generate" dihitung dari tanggal voucher DIBUAT dalam bulan ini.
    const generatedThisMonth = vouchers.filter((v) => inRange(v.created_at))

    // "Terpakai/Pendapatan" dihitung dari tanggal voucher benar-benar
    // TERPAKAI dalam bulan ini — bisa saja voucher itu dibuat di bulan
    // sebelumnya (generate massal) tapi baru laku bulan ini.
    const usedThisMonth = vouchers.filter(
      (v) => isUsedFlag(v) && inRange(usedDateOf(v))
    )

    const totalGenerated = generatedThisMonth.length
    const totalUsed = usedThisMonth.length
    const totalUnused = generatedThisMonth.filter((v) => v.status === "unused").length
    const totalRevenue = usedThisMonth.reduce(
      (sum, v) => sum + (Number(v.price) || 0),
      0
    )

    const byProfile: Record<
      string,
      { count: number; used: number; revenue: number }
    > = {}

    generatedThisMonth.forEach((v) => {
      const key = v.profile_name || "unknown"
      if (!byProfile[key]) byProfile[key] = { count: 0, used: 0, revenue: 0 }
      byProfile[key].count += 1
    })

    usedThisMonth.forEach((v) => {
      const key = v.profile_name || "unknown"
      if (!byProfile[key]) byProfile[key] = { count: 0, used: 0, revenue: 0 }
      byProfile[key].used += 1
      byProfile[key].revenue += Number(v.price) || 0
    })

    const byDate: Record<
      string,
      {
        count: number
        revenue: number
        items: { username: string; profile_name: string; price: number; used_at: string | null }[]
      }
    > = {}

    // Dikelompokkan per tanggal WIB voucher BENAR-BENAR terpakai/terjual.
    usedThisMonth.forEach((v) => {
      const rawUsedAt = usedDateOf(v)
      if (!rawUsedAt) return
      const date = wibDate(rawUsedAt)

      if (!byDate[date]) byDate[date] = { count: 0, revenue: 0, items: [] }
      byDate[date].count += 1
      byDate[date].revenue += Number(v.price) || 0
      byDate[date].items.push({
        username: v.username,
        profile_name: v.profile_name || "-",
        price: Number(v.price) || 0,
        used_at: rawUsedAt,
      })
    })

    return NextResponse.json({
      success: true,
      month,
      truncated,
      excludedProfiles: NON_SALES_PROFILES,
      summary: {
        totalGenerated,
        totalUsed,
        totalUnused,
        totalRevenue,
      },
      byProfile,
      byDate,
      recent: vouchers.slice(0, 30),
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal mengambil laporan" },
      { status: 500 }
    )
  }
}
