import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMikrotikConnection } from "@/lib/mikrotik"

function generateCode(length = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Mapping untuk tampilan print (durasi)
const durationMap: Record<string, string> = {
  "2jam/2k": "2 Jam",
  "5jam/3rb": "5 Jam",
  "10jam/5rb": "10 Jam",
  "24jam/10rb": "1 Hari",
  "MINGGUAN": "7 Hari",
  "BULANAN": "30 Hari",
  "TRIAL-USER": "2 Menit",
  "default": "-",
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { quantity, prefix, profile, price, router_id, note } = body

    if (!quantity || !profile) {
      return NextResponse.json(
        { success: false, message: "Data tidak lengkap" },
        { status: 400 }
      )
    }

    if (!router_id) {
      return NextResponse.json(
        { success: false, message: "router_id wajib disertakan" },
        { status: 400 }
      )
    }

    // 1. Wajib connect ke MikroTik
    let conn: Awaited<ReturnType<typeof getMikrotikConnection>>
    try {
      conn = await getMikrotikConnection(router_id, 15)
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          message:
            "MikroTik offline / tidak dapat terhubung. Generate dibatalkan. " +
            (err?.message || ""),
        },
        { status: 503 }
      )
    }

    // 2. Buat user di MikroTik
    const codes: string[] = []
    const vouchersForPrint = []
    const failed: string[] = []

    try {
      for (let i = 0; i < quantity; i++) {
        const code = (prefix || "") + generateCode(8)

        try {
          // Profile di MikroTik sudah mengatur session-timeout dll
          // Jadi kita hanya set name, password, profile
          await conn.write("/ip/hotspot/user/add", [
            `=name=${code}`,
            `=password=${code}`,
            `=profile=${profile}`,
            `=comment=gen-${new Date().toISOString().slice(0, 10)}`,
          ])

          codes.push(code)
          vouchersForPrint.push({
            username: code,
            password: code,
            profile,
            price: Number(price) || 0,
            validity: durationMap[profile] || profile,
            timelimit: durationMap[profile] || profile,
          })
        } catch (err: any) {
          failed.push(code)
          console.error(`Gagal tambah ${code}:`, err?.message)
        }
      }
    } finally {
      try {
        conn.close()
      } catch (_) {}
    }

    if (codes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Gagal membuat user di MikroTik. Tidak ada voucher yang dibuat.",
        },
        { status: 500 }
      )
    }

    // 3. Catat ke Supabase (untuk laporan)
    try {
      const supabase = await createClient()

      const { data: batch } = await supabase
        .from("voucher_batches")
        .insert({
          router_id,
          profile_name: profile,
          quantity: codes.length,
          prefix: prefix || null,
          price: Number(price) || 0,
        })
        .select()
        .single()

      const rows = codes.map((code) => ({
        router_id,
        batch_id: batch?.id || null,
        username: code,
        password: code,
        profile_name: profile,
        price: Number(price) || 0,
        status: "unused",
        comment: `batch-${batch?.id || "x"}`,
        note: note ? String(note).trim().slice(0, 200) : null,
      }))

      await supabase.from("vouchers").insert(rows)
    } catch (dbErr: any) {
      console.error("Supabase save failed (users already on MT):", dbErr?.message)
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil membuat ${codes.length} voucher di MikroTik`,
      count: codes.length,
      vouchers: vouchersForPrint,
      failed: failed.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal generate voucher" },
      { status: 500 }
    )
  }
}
