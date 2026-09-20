import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMikrotikConnection } from "@/lib/mikrotik"
import { getDurationLabel } from "@/lib/duration"
import { randomInt } from "node:crypto"

// Membuat puluhan user lewat VPN bisa lebih lama dari batas default fungsi
// serverless; beri ruang secukupnya supaya tidak terpotong di tengah jalan.
export const runtime = "nodejs"
export const maxDuration = 60

const MAX_QUANTITY = 50 // sama dengan batas di form Generate

// Kode voucher = kredensial login hotspot, jadi pakai generator acak yang
// aman secara kriptografi (bukan Math.random yang bisa diprediksi).
function generateCode(length = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(chars.length))
  }
  return result
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

    // Validasi di SERVER (batas di form bisa dilewati lewat request langsung).
    const qty = Math.floor(Number(quantity))
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QUANTITY) {
      return NextResponse.json(
        { success: false, message: `Jumlah voucher harus 1-${MAX_QUANTITY}` },
        { status: 400 }
      )
    }

    if (typeof profile !== "string" || profile.length > 64) {
      return NextResponse.json(
        { success: false, message: "Profile tidak valid" },
        { status: 400 }
      )
    }

    const cleanPrefix = String(prefix || "").trim()
    if (!/^[A-Za-z0-9_-]{0,12}$/.test(cleanPrefix)) {
      return NextResponse.json(
        {
          success: false,
          message: "Prefix hanya boleh huruf, angka, - dan _ (maks. 12 karakter)",
        },
        { status: 400 }
      )
    }

    if (price !== undefined && price !== null && price !== "") {
      const p = Number(price)
      if (!Number.isFinite(p) || p < 0) {
        return NextResponse.json(
          { success: false, message: "Harga tidak valid" },
          { status: 400 }
        )
      }
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
      for (let i = 0; i < qty; i++) {
        const code = cleanPrefix + generateCode(8)

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
            validity: getDurationLabel(profile),
            timelimit: getDurationLabel(profile),
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

    // 3. Catat ke Supabase (untuk laporan). supabase-js TIDAK melempar
    //    exception saat query ditolak database, jadi `error` dicek manual,
    //    dicoba ulang sekali, dan kalau tetap gagal pengguna diberi peringatan
    //    (voucher sudah terlanjur aktif di MikroTik).
    let dbWarning: string | null = null
    try {
      const supabase = await createClient()

      // voucher_batches hanya log; kalau gagal, voucher tetap dicatat
      // tanpa batch_id.
      const { data: batch, error: batchErr } = await supabase
        .from("voucher_batches")
        .insert({
          router_id,
          profile_name: profile,
          quantity: codes.length,
          prefix: cleanPrefix || null,
          price: Number(price) || 0,
        })
        .select()
        .single()

      if (batchErr) {
        console.error("Supabase batch insert gagal:", batchErr.message)
      }

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

      let failedRows = 0
      let lastError = ""

      for (let i = 0; i < rows.length; i += 100) {
        const part = rows.slice(i, i + 100)

        let { error } = await supabase
          .from("vouchers")
          .upsert(part, { onConflict: "router_id,username" })

        if (error) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          ;({ error } = await supabase
            .from("vouchers")
            .upsert(part, { onConflict: "router_id,username" }))
        }

        if (error) {
          failedRows += part.length
          lastError = error.message
          console.error("Supabase voucher insert gagal:", error.message)
        }
      }

      if (failedRows > 0) {
        dbWarning =
          `${failedRows} voucher belum tercatat di database (${lastError}). ` +
          "Voucher tetap aktif di MikroTik dan akan tercatat saat Sync berikutnya, " +
          "tetapi Keterangan-nya tidak tersimpan."
      }
    } catch (dbErr: any) {
      console.error("Supabase save failed (users already on MT):", dbErr?.message)
      dbWarning =
        "Voucher belum tercatat di database (" +
        (dbErr?.message || "error") +
        "). Voucher tetap aktif di MikroTik dan akan tercatat saat Sync berikutnya."
    }

    return NextResponse.json({
      success: true,
      message:
        `Berhasil membuat ${codes.length} voucher di MikroTik` +
        (dbWarning ? `. Peringatan: ${dbWarning}` : ""),
      count: codes.length,
      vouchers: vouchersForPrint,
      failed: failed.length,
      warning: dbWarning || undefined,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Gagal generate voucher" },
      { status: 500 }
    )
  }
}
