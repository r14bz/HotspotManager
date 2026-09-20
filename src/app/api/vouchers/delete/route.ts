import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMikrotikConnection } from "@/lib/mikrotik"
import { syncVouchersFromMikrotik } from "@/lib/sync"

export const maxDuration = 60

const IN_CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ATURAN:
// - MikroTik = sumber kebenaran: voucher dihapus dari MikroTik.
// - Voucher yang SUDAH TERPAKAI tetap disimpan di database sebagai arsip
//   laporan bulanan. Voucher yang belum pernah dipakai dihapus dari database.
// - Database hanya disentuh untuk voucher yang benar-benar sudah hilang di
//   MikroTik (berhasil dihapus, atau memang sudah tidak ada). Yang gagal
//   dihapus di MikroTik dibiarkan apa adanya.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { usernames, router_id } = body

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return NextResponse.json(
        { success: false, message: "Tidak ada voucher yang dipilih" },
        { status: 400 }
      )
    }

    if (!router_id) {
      return NextResponse.json(
        { success: false, message: "router_id wajib disertakan" },
        { status: 400 }
      )
    }

    const names: string[] = Array.from(
      new Set<string>(usernames.map((u: unknown) => String(u)).filter(Boolean))
    )

    // 0. Catat kondisi terbaru dari MikroTik ke database LEBIH DULU, supaya
    //    voucher yang sudah terpakai tapi belum sempat tercatat (mis. baru
    //    dipakai sejak sync terakhir) tetap masuk arsip sebelum dihapus.
    //    Kalau pencatatan gagal, penghapusan dibatalkan (arsip lebih penting).
    try {
      const snapshot = await syncVouchersFromMikrotik(router_id)
      if (!snapshot.synced) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Data terbaru belum bisa dicatat ke database, jadi penghapusan dibatalkan " +
              "supaya arsip laporan aman. Coba lagi sebentar.",
          },
          { status: 503 }
        )
      }
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          message:
            "MikroTik offline. Tidak bisa menghapus. " + (err?.message || ""),
        },
        { status: 503 }
      )
    }

    // 1. Hapus dari MikroTik (wajib)
    let conn: Awaited<ReturnType<typeof getMikrotikConnection>>
    try {
      conn = await getMikrotikConnection(router_id, 15)
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          message:
            "MikroTik offline. Tidak bisa menghapus. " + (err?.message || ""),
        },
        { status: 503 }
      )
    }

    let removed = 0
    const gone: string[] = [] // berhasil dihapus ATAU memang sudah tidak ada
    const errors: string[] = []

    try {
      for (const username of names) {
        try {
          const found = await conn.write("/ip/hotspot/user/print", [
            `?name=${username}`,
          ])

          if (found && found.length > 0) {
            await conn.write("/ip/hotspot/user/remove", [
              `=.id=${found[0][".id"]}`,
            ])
            removed++
          }
          gone.push(username)
        } catch (err: any) {
          errors.push(`${username}: ${err?.message || "gagal"}`)
        }
      }
    } finally {
      try {
        conn.close()
      } catch (_) {}
    }

    if (gone.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Tidak ada user yang berhasil dihapus dari MikroTik",
          errors,
        },
        { status: 500 }
      )
    }

    // 2. Bersihkan database: hapus yang belum pernah dipakai, arsipkan sisanya.
    let archived = 0
    let warning: string | undefined

    try {
      const supabase = await createClient()

      for (const part of chunk(gone, IN_CHUNK)) {
        const { data: rows, error: selErr } = await supabase
          .from("vouchers")
          .select("username, status, used_at, sold_at")
          .eq("router_id", router_id)
          .in("username", part)

        if (selErr) throw selErr

        const toDelete: string[] = []
        for (const row of rows || []) {
          const isUsed =
            row.status === "used" ||
            row.status === "online" ||
            !!row.used_at ||
            !!row.sold_at
          if (isUsed) archived++
          else toDelete.push(row.username)
        }

        if (toDelete.length > 0) {
          const { error: delErr } = await supabase
            .from("vouchers")
            .delete()
            .eq("router_id", router_id)
            .in("username", toDelete)

          if (delErr) throw delErr
        }
      }
    } catch (e: any) {
      console.error("Supabase cleanup failed:", e)
      warning =
        "Voucher sudah dihapus dari MikroTik, tetapi database gagal dibersihkan (" +
        (e?.message || "error") +
        "). Sisa data akan dibersihkan otomatis saat Sync berikutnya."
    }

    const alreadyGone = gone.length - removed
    let message = `Berhasil menghapus ${removed} voucher dari MikroTik`
    if (alreadyGone > 0) message += `, ${alreadyGone} sudah tidak ada di MikroTik`
    if (archived > 0) {
      message += `. ${archived} voucher terpakai tetap disimpan sebagai arsip laporan`
    }
    if (errors.length > 0) message += `. ${errors.length} gagal dihapus`
    if (warning) message += `. Peringatan: ${warning}`

    return NextResponse.json({
      success: true,
      message,
      deleted: removed,
      archived,
      warning,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Gagal menghapus" },
      { status: 500 }
    )
  }
}
