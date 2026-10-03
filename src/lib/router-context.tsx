"use client"

import { createContext, useContext, useEffect, useState } from "react"

export type RouterOption = {
  id: string
  name: string
  local_ip: string | null
}

type RouterContextValue = {
  routers: RouterOption[]
  activeRouterId: string | null
  activeRouter: RouterOption | null
  setActiveRouterId: (id: string) => void
  loading: boolean
  error: string | null
}

const RouterContext = createContext<RouterContextValue | null>(null)

const STORAGE_KEY = "active_router_id"

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [routers, setRouters] = useState<RouterOption[]>([])
  const [activeRouterId, setActiveRouterIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/routers")
        const json = await res.json()

        if (json.success) {
          const list: RouterOption[] = json.data || []
          setRouters(list)

          const saved =
            typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
          const stillValid = list.find((r) => r.id === saved)
          const initial = stillValid ? saved! : list[0]?.id || null
          setActiveRouterIdState(initial)
          // Simpan juga router default ke localStorage, supaya halaman
          // /print (yang membaca router dari localStorage) memakai
          // pengaturan template yang benar walau router belum pernah
          // dipilih manual lewat dropdown.
          if (initial && typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, initial)
          }

          if (list.length === 0) {
            setError("Belum ada router terdaftar. Tambahkan lewat Supabase dulu.")
          }
        } else {
          setError(json.message || "Gagal memuat daftar router")
        }
      } catch (e: any) {
        setError(e?.message || "Gagal memuat daftar router")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const setActiveRouterId = (id: string) => {
    setActiveRouterIdState(id)
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id)
    }
  }

  const activeRouter = routers.find((r) => r.id === activeRouterId) || null

  return (
    <RouterContext.Provider
      value={{ routers, activeRouterId, activeRouter, setActiveRouterId, loading, error }}
    >
      {children}
    </RouterContext.Provider>
  )
}

export function useActiveRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error("useActiveRouter harus dipakai di dalam <RouterProvider>")
  }
  return ctx
}
