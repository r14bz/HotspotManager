"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Loader2, AlertCircle } from "lucide-react"

// Parameter ?next= dikontrol pengunjung, jadi hanya boleh mengarah ke
// halaman di domain ini (mencegah open redirect, mis. ?next=//evil.com).
// Dipanggil hanya di event handler (butuh window).
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard"
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return "/dashboard"
    return url.pathname + url.search + url.hash
  } catch {
    return "/dashboard"
  }
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextParam = searchParams.get("next")

  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const json = await res.json()

      if (json.success) {
        router.push(safeNext(nextParam))
        router.refresh()
      } else {
        setError(json.message || "Login gagal")
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <Image
            src="/logo/wordmark-mikrotik.png"
            alt="MikroTik Hotspot Manager"
            width={280}
            height={52}
            className="mb-5 h-auto"
            priority
          />
          <p className="text-white/40 text-sm mt-1">Masuk untuk mengelola jaringan</p>
        </div>

        <div className="bg-surface rounded-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal"
                autoComplete="current-password"
                required
              />
            </div>

            {error ? (
              <div className="flex items-start gap-2 bg-danger-soft text-danger rounded-lg p-3 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-signal hover:bg-signal-dark disabled:opacity-60 text-signal-on font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </div>

        <p className="text-center text-white/25 text-xs mt-6">© 2026 MAMANAIY.NET</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ink flex items-center justify-center text-white/40 text-sm">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
