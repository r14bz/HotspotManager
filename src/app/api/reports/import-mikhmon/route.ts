import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const monthMap: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
}

function parseMikhmonDate(dateStr: string, timeStr: string) {
  const parts = (dateStr || "").trim().split("/")
  if (parts.length !== 3) return null

  const mon = monthMap[(parts[0] || "").toLowerCase()]
  const day = String(parts[1] || "").padStart(2, "0")
  const year = parts[2]
  if (!mon || !day || !year) return null

  const time = (timeStr || "00:00:00").trim()
  const iso = year + "-" + mon + "-" + day + "T" + time + "+07:00"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

// Parser CSV yang mengenali tanda kutip. Sebelumnya baris dipecah dengan
// split(","), sehingga komentar yang berisi koma (mis. "Titip jual, Bu Siti")
// menggeser semua kolom sesudahnya dan harga terbaca salah / baris terlewat.
// - pemisah di dalam "..." bukan pemisah kolom
// - "" di dalam kutip = satu tanda kutip
// - kutip hanya dianggap pembuka kalau muncul di awal kolom
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  const pushRow = () => {
    row.push(field)
    field = ""
    if (row.some((c) => c.trim() !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      pushRow()
    } else {
      field += ch
    }
  }
  pushRow()

  return rows
}

// Beberapa versi/locale mengekspor CSV dengan titik-koma. Tentukan pemisah
// dari baris header (yang memuat "username" dan "profile").
function detectDelimiter(text: string): string {
  const allLines = text.split(/\r?\n/)
  const header =
    allLines.slice(0, 15).find((l) => {
      const lower = l.toLowerCase()
      return lower.includes("username") && lower.includes("profile")
    }) ??
    allLines.find((l) => l.trim()) ??
    ""
  const semi = (header.match(/;/g) || []).length
  const comma = (header.match(/,/g) || []).length
  return semi > comma ? ";" : ","
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const routerId = form.get("router_id") as string | null

    if (!file) {
      return NextResponse.json(
        { success: false, message: "File CSV tidak ditemukan" },
        { status: 400 }
      )
    }

    if (!routerId) {
      return NextResponse.json(
        { success: false, message: "router_id wajib disertakan" },
        { status: 400 }
      )
    }

    const text = (await file.text()).replace(/^\uFEFF/, "")
    const table = parseCsv(text, detectDelimiter(text))

    let startIndex = 0
    for (let i = 0; i < Math.min(table.length, 15); i++) {
      const lower = table[i].join(",").toLowerCase()
      if (lower.includes("username") && lower.includes("profile")) {
        startIndex = i + 1
        break
      }
    }

    const rows: any[] = []
    const errors: string[] = []

    for (let i = startIndex; i < table.length; i++) {
      const cols = table[i]
      if (cols.length < 7) continue

      const dateStr = (cols[1] || "").trim()
      const timeStr = (cols[2] || "").trim()
      const username = (cols[3] || "").trim()
      const profile = (cols[4] || "").trim()
      const comment = (cols[5] || "").trim()
      const priceRaw = (cols[6] || "").trim().replace(/[^\d]/g, "")
      const price = Number(priceRaw) || 0

      if (!username) continue

      const createdAt = parseMikhmonDate(dateStr, timeStr)
      if (!createdAt) {
        errors.push("Baris " + (i + 1) + ": tanggal invalid")
        continue
      }

      rows.push({
        router_id: routerId,
        username,
        password: username,
        profile_name: profile || "unknown",
        price,
        status: "used",
        comment: comment || "import-mikhmon",
        created_at: createdAt,
        used_at: createdAt,
        sold_at: createdAt,
      })
    }

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Tidak ada data valid untuk diimport",
          errors: errors.slice(0, 10),
        },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    let inserted = 0
    const chunkSize = 100

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      const { error } = await supabase.from("vouchers").upsert(chunk, {
        onConflict: "router_id,username",
      })

      if (error) {
        for (const row of chunk) {
          const { error: e2 } = await supabase.from("vouchers").upsert(row, {
            onConflict: "router_id,username",
          })
          if (!e2) inserted++
          else errors.push(row.username + ": " + e2.message)
        }
      } else {
        inserted += chunk.length
      }
    }

    return NextResponse.json({
      success: true,
      message: "Import selesai",
      totalParsed: rows.length,
      inserted,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
    })
  } catch (error: any) {
    console.error("Import error:", error)
    return NextResponse.json(
      { success: false, message: error?.message || "Gagal import" },
      { status: 500 }
    )
  }
}
