// Ekspor Laporan Penjualan ke Excel (.xlsx) dan CSV, sepenuhnya di browser
// dan TANPA dependency tambahan.
//
// File .xlsx adalah arsip ZIP berisi beberapa file XML, jadi cukup ditulis
// langsung: penulis ZIP sederhana (tanpa kompresi) + XML lembar kerja.
// Hasilnya rapi di Excel / Google Sheets / LibreOffice: judul, header
// berwarna, lebar kolom pas, format Rp dan tanggal, baris total, dan
// baris header yang dibekukan.

export type ReportItem = {
  username: string
  profile_name: string
  price: number
  used_at: string | null
}

export type ReportExportInput = {
  month: string // "2026-09"
  routerName?: string | null
  summary: {
    totalGenerated?: number
    totalUsed?: number
    totalUnused?: number
    totalRevenue?: number
  }
  byProfile: Record<string, { count: number; used: number; revenue: number }>
  byDate: Record<string, { count: number; revenue: number; items: ReportItem[] }>
}

const TZ = "Asia/Jakarta"

// ---------- format tanggal & jam (selalu WIB) ----------

function timeWib(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d)
}

function nowWibLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .replace(", ", " ")
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number)
  if (!y || !m) return month
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
}

// "2026-09-20" -> nomor seri tanggal Excel
function excelDateSerial(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 + 25569
}

export function reportFileName(month: string, ext: "xlsx" | "csv"): string {
  return "laporan-voucher-" + month + "." + ext
}

// ---------- baris detail (satu baris per voucher terjual) ----------

type DetailRow = { date: string; time: string; username: string; profile: string; price: number }

function buildDetailRows(byDate: ReportExportInput["byDate"]): DetailRow[] {
  const rows: DetailRow[] = []
  for (const date of Object.keys(byDate).sort()) {
    const items = [...(byDate[date].items || [])].sort((a, b) =>
      (a.used_at || "~") < (b.used_at || "~") ? -1 : 1
    )
    for (const it of items) {
      rows.push({
        date,
        time: timeWib(it.used_at),
        username: it.username,
        profile: it.profile_name || "-",
        price: Number(it.price) || 0,
      })
    }
  }
  return rows
}

// ================= CSV =================
// Satu baris per voucher terjual, kolom bersih (mudah di-filter / pivot).
// Pemisah titik-koma + BOM UTF-8 supaya langsung terbaca benar di Excel
// (locale Indonesia). Sel yang diawali = + - @ diberi apostrof di depan
// supaya tidak dianggap rumus oleh Excel.

function csvCell(value: string | number): string {
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function buildReportCsv(input: ReportExportInput): string {
  const lines: string[] = [["Tanggal", "Jam", "Kode Voucher", "Profile", "Harga"].join(";")]
  for (const r of buildDetailRows(input.byDate)) {
    lines.push(
      [r.date, r.time, csvCell(r.username), csvCell(r.profile), r.price].join(";")
    )
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n"
}

// ================= XLSX =================

// Indeks gaya (harus sama dengan urutan <cellXfs> di STYLES_XML).
const S = {
  normal: 0,
  title: 1,
  label: 2,
  header: 3,
  text: 4,
  int: 5,
  money: 6,
  date: 7,
  totalLabel: 8,
  totalInt: 9,
  totalMoney: 10,
  note: 11,
  center: 12,
} as const

type Cell = { v: string | number | null; s: number }
const c = (v: string | number | null, s: number): Cell => ({ v, s })

function colName(i: number): string {
  let n = i + 1
  let out = ""
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function escXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

type SheetOptions = {
  widths: number[]
  gridLines?: boolean
  freezeRows?: number
  autoFilter?: boolean
}

function sheetXml(rows: Cell[][], opt: SheetOptions): string {
  const maxCols = Math.max(1, ...rows.map((r) => r.length))
  const lastRow = Math.max(1, rows.length)

  let xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${colName(maxCols - 1)}${lastRow}"/>`

  xml += `<sheetViews><sheetView workbookViewId="0"${opt.gridLines === false ? ' showGridLines="0"' : ""}>`
  if (opt.freezeRows) {
    xml +=
      `<pane ySplit="${opt.freezeRows}" topLeftCell="A${opt.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` +
      `<selection pane="bottomLeft" activeCell="A${opt.freezeRows + 1}" sqref="A${opt.freezeRows + 1}"/>`
  }
  xml += "</sheetView></sheetViews>"

  xml += '<sheetFormatPr defaultRowHeight="15"/>'
  xml +=
    "<cols>" +
    opt.widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join("") +
    "</cols>"

  xml += "<sheetData>"
  rows.forEach((row, ri) => {
    const r = ri + 1
    const tall = row[0]?.s === S.header ? ' ht="21" customHeight="1"' : row[0]?.s === S.title ? ' ht="24" customHeight="1"' : ""
    xml += `<row r="${r}"${tall}>`
    row.forEach((cell, ci) => {
      const ref = colName(ci) + r
      if (cell.v === null || cell.v === "") {
        xml += `<c r="${ref}" s="${cell.s}"/>`
      } else if (typeof cell.v === "number") {
        xml += `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`
      } else {
        xml += `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${escXml(cell.v)}</t></is></c>`
      }
    })
    xml += "</row>"
  })
  xml += "</sheetData>"

  if (opt.autoFilter && rows.length > 1) {
    xml += `<autoFilter ref="A1:${colName(maxCols - 1)}${lastRow}"/>`
  }

  xml +=
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
    "</worksheet>"
  return xml
}

const thin = (side: string) => `<${side} style="thin"><color rgb="FFD0D5DD"/></${side}>`

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
  '<numFmt numFmtId="165" formatCode="&quot;Rp&quot; #,##0"/>' +
  "</numFmts>" +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="15"/><color rgb="FF0E1526"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><i/><sz val="10"/><color rgb="FF667085"/><name val="Calibri"/><family val="2"/></font>' +
  "</fonts>" +
  '<fills count="4">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0E1526"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F5"/><bgColor indexed="64"/></patternFill></fill>' +
  "</fills>" +
  '<borders count="2">' +
  "<border><left/><right/><top/><bottom/><diagonal/></border>" +
  `<border>${thin("left")}${thin("right")}${thin("top")}${thin("bottom")}<diagonal/></border>` +
  "</borders>" +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="13">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 0 normal
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' + // 1 title
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // 2 label
  '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 3 header
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' + // 4 text
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' + // 5 int
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' + // 6 money
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 7 date
  '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' + // 8 total label
  '<xf numFmtId="3" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 9 total int
  '<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 10 total money
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // 11 note
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 12 center
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>"

// ---------- isi tiap lembar ----------

function summarySheet(input: ReportExportInput): string {
  const sm = input.summary || {}
  const rows: Cell[][] = []

  rows.push([c("Laporan Penjualan Voucher", S.title)])
  rows.push([c("Router", S.label), c(input.routerName || "-", S.normal)])
  rows.push([c("Periode", S.label), c(monthLabel(input.month), S.normal)])
  rows.push([c("Diekspor", S.label), c(nowWibLabel() + " WIB", S.normal)])
  rows.push([])

  rows.push([c("Ringkasan", S.header), c("Nilai", S.header)])
  rows.push([c("Total Generate", S.text), c(sm.totalGenerated || 0, S.int)])
  rows.push([c("Sudah Dipakai", S.text), c(sm.totalUsed || 0, S.int)])
  rows.push([c("Belum Dipakai", S.text), c(sm.totalUnused || 0, S.int)])
  rows.push([c("Pendapatan", S.totalLabel), c(sm.totalRevenue || 0, S.totalMoney)])
  rows.push([])

  rows.push([
    c("Profile", S.header),
    c("Generate", S.header),
    c("Dipakai", S.header),
    c("Pendapatan", S.header),
  ])
  const profiles = Object.entries(input.byProfile || {}).sort(
    (a, b) => (b[1].revenue || 0) - (a[1].revenue || 0) || a[0].localeCompare(b[0])
  )
  let tg = 0
  let tu = 0
  let tr = 0
  for (const [name, info] of profiles) {
    tg += info.count || 0
    tu += info.used || 0
    tr += info.revenue || 0
    rows.push([
      c(name, S.text),
      c(info.count || 0, S.int),
      c(info.used || 0, S.int),
      c(info.revenue || 0, S.money),
    ])
  }
  rows.push([
    c("Total", S.totalLabel),
    c(tg, S.totalInt),
    c(tu, S.totalInt),
    c(tr, S.totalMoney),
  ])
  rows.push([])
  rows.push([
    c(
      "Catatan: pendapatan dihitung dari tanggal voucher terpakai (WIB), bukan tanggal dibuat.",
      S.note
    ),
  ])

  return sheetXml(rows, { widths: [30, 14, 14, 20], gridLines: false })
}

function perDateSheet(input: ReportExportInput): string {
  const rows: Cell[][] = [
    [c("Tanggal", S.header), c("Terjual", S.header), c("Pendapatan", S.header)],
  ]
  let tc = 0
  let tr = 0
  for (const date of Object.keys(input.byDate || {}).sort()) {
    const info = input.byDate[date]
    const serial = excelDateSerial(date)
    tc += info.count || 0
    tr += info.revenue || 0
    rows.push([
      serial === null ? c(date, S.center) : c(serial, S.date),
      c(info.count || 0, S.int),
      c(info.revenue || 0, S.money),
    ])
  }
  rows.push([c("Total", S.totalLabel), c(tc, S.totalInt), c(tr, S.totalMoney)])
  return sheetXml(rows, { widths: [16, 12, 20], freezeRows: 1 })
}

function detailSheet(input: ReportExportInput): string {
  const rows: Cell[][] = [
    [
      c("Tanggal", S.header),
      c("Jam", S.header),
      c("Kode Voucher", S.header),
      c("Profile", S.header),
      c("Harga", S.header),
    ],
  ]
  for (const r of buildDetailRows(input.byDate || {})) {
    const serial = excelDateSerial(r.date)
    rows.push([
      serial === null ? c(r.date, S.center) : c(serial, S.date),
      c(r.time, S.center),
      c(r.username, S.text),
      c(r.profile, S.text),
      c(r.price, S.money),
    ])
  }
  return sheetXml(rows, { widths: [14, 9, 26, 16, 16], freezeRows: 1, autoFilter: true })
}

// ---------- penulis ZIP (tanpa kompresi) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let x = n
    for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1
    t[n] = x >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let x = 0xffffffff
  for (let i = 0; i < data.length; i++) x = CRC_TABLE[(x ^ data[i]) & 0xff] ^ (x >>> 8)
  return (x ^ 0xffffffff) >>> 0
}

function zipStore(files: { name: string; data: Uint8Array }[]) {
  const enc = new TextEncoder()
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // nama file UTF-8
    lv.setUint16(8, 0, true) // 0 = disimpan tanpa kompresi
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)

    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cd.set(name, 46)

    parts.push(local, f.data)
    central.push(cd)
    offset += local.length + size
  }

  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)

  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let pos = 0
  for (const p of all) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

// ---------- rakit file .xlsx ----------

export function buildReportXlsx(input: ReportExportInput) {
  const enc = new TextEncoder()
  const sheets = [
    { name: "Ringkasan", xml: summarySheet(input) },
    { name: "Per Tanggal", xml: perDateSheet(input) },
    { name: "Detail Voucher", xml: detailSheet(input) },
  ]

  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>"

  const rootRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>"

  const workbook =
    XML +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    "<sheets>" +
    sheets
      .map((s, i) => `<sheet name="${escXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("") +
    "</sheets></workbook>"

  const workbookRels =
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>"

  return zipStore([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) },
    { name: "xl/styles.xml", data: enc.encode(STYLES_XML) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: enc.encode(s.xml),
    })),
  ])
}
