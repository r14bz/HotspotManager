"use client"

import LogoutButton from "@/components/LogoutButton"
import ThemeToggle from "@/components/ThemeToggle"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Ticket,
  ListChecks,
  BarChart3,
  Settings,
  Router as RouterIcon,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { RouterProvider, useActiveRouter } from "@/lib/router-context"

const menu = [
  { name: "Dashboard", short: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "User Aktif", short: "User", href: "/dashboard/users", icon: Users },
  { name: "Generate Voucher", short: "Buat", href: "/dashboard/vouchers", icon: Ticket },
  { name: "Kelola Voucher", short: "Voucher", href: "/dashboard/vouchers/list", icon: ListChecks },
  { name: "Laporan", short: "Laporan", href: "/dashboard/reports", icon: BarChart3 },
  { name: "Pengaturan", short: "Atur", href: "/dashboard/settings", icon: Settings },
]

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname.startsWith(href)
}

function RouterSwitcher({ variant }: { variant: "sidebar" | "topbar" }) {
  const { routers, activeRouterId, setActiveRouterId, loading } = useActiveRouter()

  if (loading || routers.length === 0) return null

  const baseClass =
    variant === "sidebar"
      ? "w-full bg-white/5 border border-ink-line text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-signal/50"
      : "bg-paper border border-line text-text-primary text-xs rounded-md px-2 py-1.5 focus:outline-none max-w-[140px]"

  return (
    <select
      value={activeRouterId || ""}
      onChange={(e) => setActiveRouterId(e.target.value)}
      className={baseClass}
    >
      {routers.map((r) => (
        <option key={r.id} value={r.id} className="text-black">
          {r.name}
        </option>
      ))}
    </select>
  )
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const current = menu.find((m) => isActive(pathname, m.href))
  const { loading, error, routers, activeRouterId } = useActiveRouter()

  return (
    <div className="min-h-screen bg-paper md:flex">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-ink text-white">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-ink-line">
          <Image src="/logo/icon-mikrotik.png" alt="MikroTik Hotspot Manager" width={36} height={36} />
          <div>
            <p className="font-semibold text-[15px] leading-tight">MikroTik</p>
            <p className="text-[11px] text-white/45">Hotspot Manager</p>
          </div>
        </div>

        <div className="px-4 pt-4">
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1.5 flex items-center gap-1.5">
            <RouterIcon className="w-3 h-3" />
            Router aktif
          </p>
          <RouterSwitcher variant="sidebar" />
        </div>

        <nav className="flex-1 px-3 pt-4 pb-4 space-y-0.5">
          {menu.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors " +
                  (active
                    ? "bg-signal/15 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white")
                }
              >
                <item.icon className={"w-[18px] h-[18px] " + (active ? "text-signal" : "")} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="px-5 py-4 border-t border-ink-line text-[11px] text-white/35">
          © 2026 MIKROTIK HOTSPOT MANAGER
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-ink md:bg-surface md:border-b md:border-line">
          <div className="flex items-center justify-between px-4 md:px-6 py-3.5">
            <div className="flex items-center gap-2.5 md:gap-0">
              <div className="w-7 h-7 flex items-center justify-center md:hidden">
                <Image src="/logo/icon-mikrotik.png" alt="MikroTik Hotspot Manager" width={26} height={26} />
              </div>
              <h1 className="text-[15px] font-semibold text-white md:text-text-primary md:text-lg">
                {current?.name || "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="md:hidden">
                <RouterSwitcher variant="topbar" />
              </span>
              <span className="md:hidden">
                <ThemeToggle variant="dark" />
              </span>
              <span className="hidden md:inline-flex">
                <ThemeToggle variant="light" />
              </span>
              <span className="hidden md:inline text-sm text-text-secondary">Admin</span>
              <LogoutButton />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-5 pb-24 md:pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-text-muted gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Memuat daftar router...
            </div>
          ) : error || routers.length === 0 ? (
            <div className="bg-danger-soft border border-danger/20 text-danger rounded-xl p-4 flex items-start gap-3 text-sm max-w-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Belum ada router terdaftar</p>
                <p className="text-xs mt-1 opacity-90">
                  {error || "Tambahkan router lewat Supabase (tabel routers) dulu."}
                </p>
              </div>
            </div>
          ) : !activeRouterId ? (
            <div className="flex items-center justify-center py-24 text-text-muted gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Menyiapkan router...
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-ink border-t border-ink-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-6">
          {menu.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center gap-1 py-2.5"
              >
                <item.icon
                  className={"w-5 h-5 " + (active ? "text-signal" : "text-white/45")}
                />
                <span
                  className={
                    "text-[9.5px] leading-none " +
                    (active ? "text-signal font-medium" : "text-white/45")
                  }
                >
                  {item.short}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RouterProvider>
      <DashboardShell>{children}</DashboardShell>
    </RouterProvider>
  )
}
