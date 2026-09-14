import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

    // Validasi format YYYY-MM
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      month = null
    }

    // Default: bulan ini
    if (!month) {
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, "0")
      month = `${y}-${m}`
    }

    const start = `${month}-01T00:00:00.000Z`

    // Hitung akhir bulan
    const [yearStr, monthStr] = month.split("-")
    const year = Number(yearStr)
    const mon = Number(monthStr)
    const endDate = new Date(Date.UTC(year, mon, 1)) // bulan berikutnya
    const end = endDate.toISOString()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("vouchers")
      .select("id, username, profile_name, price, status, created_at, sold_at, used_at")
      .eq("router_id", routerId)
      .or(
        `and(created_at.gte.${start},created_at.lt.${end}),` +
          `and(used_at.gte.${start},used_at.lt.${end})`
      )
      .order("created_at", { ascending: false })
      .limit(1000)

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      )
    }

    const vouchers = data || []
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()

    const inRange = (iso: string | null | undefined) => {
      if (!iso) return false
      const t = new Date(iso).getTime()
      return t >= startTime && t < endTime
    }

    const isUsedFlag = (v: (typeof vouchers)[number]) =>
      v.status === "used" || v.status === "online" || !!v.sold_at || !!v.used_at

    const usedDateOf = (v: (typeof vouchers)[number]) =>
      v.used_at || v.sold_at || v.created_at

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

    // Dikelompokkan berdasarkan tanggal voucher BENAR-BENAR terpakai/terjual
    // (used_at / sold_at), bukan tanggal voucher dibuat (created_at) —
    // supaya voucher yang di-generate massal lalu dipakai belakangan
    // tercatat pendapatannya di hari dia laku, bukan di hari generate.
    usedThisMonth.forEach((v) => {
      const rawUsedAt = usedDateOf(v)
      const date = (rawUsedAt || "").split("T")[0]
      if (!date) return

      if (!byDate[date]) byDate[date] = { count: 0, revenue: 0, items: [] }
      byDate[date].count += 1
      byDate[date].revenue += Number(v.price) || 0
      byDate[date].items.push({
        username: v.username,
        profile_name: v.profile_name || "-",
        price: Number(v.price) || 0,
        used_at: rawUsedAt || null,
      })
    })

    return NextResponse.json({
      success: true,
      month,
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
