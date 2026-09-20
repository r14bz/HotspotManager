import { NextRequest, NextResponse } from "next/server"
import { withMikrotik } from "@/lib/mikrotik"

export async function GET(req: NextRequest) {
  const routerId = req.nextUrl.searchParams.get("router_id")
  if (!routerId) {
    return NextResponse.json(
      { success: false, message: "router_id wajib disertakan" },
      { status: 400 }
    )
  }

  // Mode ringan (default): hanya data yang berubah-ubah (resource, user
  // aktif, traffic). Mode ?full=1: ditambah data statis (identity, model,
  // serial, firmware) dan LOG. /log/print mengembalikan seluruh isi log
  // router dan paling berat untuk router kecil, jadi hanya diminta saat
  // halaman dibuka / tombol Refresh ditekan, bukan di tiap polling.
  const full = req.nextUrl.searchParams.get("full") === "1"

  try {
    const [resource, activeUsers, interfaces, identity, routerboard, logs] =
      await withMikrotik(
        routerId,
        (conn) =>
          Promise.all([
            conn.write("/system/resource/print"),
            conn.write("/ip/hotspot/active/print"),
            conn.write("/interface/print"),
            full ? conn.write("/system/identity/print") : Promise.resolve(null),
            full ? conn.write("/system/routerboard/print") : Promise.resolve(null),
            full ? conn.write("/log/print") : Promise.resolve(null),
          ]),
        12
      )

    const res = resource?.[0] || {}
    const rb = routerboard?.[0] || {}

    // Hanya ada di mode full. Di mode ringan kunci-kunci ini SENGAJA tidak
    // dikirim supaya nilai lama di halaman tidak tertimpa default.
    const fullOnly = full
      ? {
          identity: identity?.[0]?.name || "MikroTik",
          board: res["board-name"] || rb["board-name"] || "-",
          model: rb.model || res["board-name"] || "-",
          serial: rb["serial-number"] || "-",
          firmware: rb["current-firmware"] || "-",
          logs: (logs || [])
            .slice(-12)
            .reverse()
            .map((log: any) => ({
              time: log.time || "",
              topics: log.topics || "",
              message: log.message || "",
            })),
        }
      : {}

    const totalMemory = Number(res["total-memory"] || 0)
    const freeMemory = Number(res["free-memory"] || 0)
    const usedMemory = totalMemory - freeMemory

    const totalHdd = Number(res["total-hdd-space"] || 0)
    const freeHdd = Number(res["free-hdd-space"] || 0)
    const usedHdd = totalHdd - freeHdd

    // Cari interface yang kemungkinan WAN (ether1 atau yang punya traffic besar)
    const ifaces = interfaces || []
    const wanCandidates = ifaces.filter(
      (i: any) =>
        i.type === "ether" ||
        i.name?.toLowerCase().includes("wan") ||
        i.name?.toLowerCase().includes("ether1")
    )

    // Ambil interface dengan traffic tertinggi sebagai acuan
    let mainIface = wanCandidates[0] || ifaces[0] || {}
    let maxTraffic = 0

    for (const iface of ifaces) {
      const traffic =
        Number(iface["rx-byte"] || 0) + Number(iface["tx-byte"] || 0)
      if (traffic > maxTraffic) {
        maxTraffic = traffic
        mainIface = iface
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        // System Info
        version: res.version || "-",
        architecture: res["architecture-name"] || "-",
        uptime: res.uptime || "-",
        cpu: res["cpu-load"] || "0",
        cpuCount: res["cpu-count"] || "1",
        cpuFrequency: res["cpu-frequency"] || "-",

        memory: {
          total: formatBytes(totalMemory),
          used: formatBytes(usedMemory),
          free: formatBytes(freeMemory),
          percent: totalMemory ? Math.round((usedMemory / totalMemory) * 100) : 0,
        },

        hdd: {
          total: formatBytes(totalHdd),
          used: formatBytes(usedHdd),
          free: formatBytes(freeHdd),
          percent: totalHdd ? Math.round((usedHdd / totalHdd) * 100) : 0,
        },

        // Traffic
        traffic: {
          interface: mainIface.name || "-",
          rx: formatBytes(Number(mainIface["rx-byte"] || 0)),
          tx: formatBytes(Number(mainIface["tx-byte"] || 0)),
          rxPackets: Number(mainIface["rx-packet"] || 0).toLocaleString("id-ID"),
          txPackets: Number(mainIface["tx-packet"] || 0).toLocaleString("id-ID"),
        },

        activeUsers: (activeUsers || []).length,
        users: (activeUsers || []).slice(0, 10).map((u: any) => ({
          user: u.user || "-",
          address: u.address || "-",
          uptime: u.uptime || "-",
          mac: u["mac-address"] || "-",
        })),

        ...fullOnly,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Gagal mengambil data dari MikroTik",
      },
      { status: 500 }
    )
  }
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}
