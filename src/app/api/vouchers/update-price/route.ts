import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Edit harga per voucher = PENGECUALIAN KHUSUS. Harga ini ditandai
// price_override = true supaya sync tidak menimpanya dengan harga profile.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const username = (body.username || "").trim()
    const price = Number(body.price)
    const routerId = body.router_id

    if (!username) {
      return NextResponse.json(
        { success: false, message: "Username wajib diisi" },
        { status: 400 }
      )
    }

    if (!routerId) {
      return NextResponse.json(
        { success: false, message: "router_id wajib disertakan" },
        { status: 400 }
      )
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { success: false, message: "Harga tidak valid" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from("vouchers")
      .update({ price, price_override: true })
      .eq("router_id", routerId)
      .eq("username", username)

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: "Harga berhasil diperbarui" })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Gagal memperbarui harga" },
      { status: 500 }
    )
  }
}
