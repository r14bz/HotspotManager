"use client"

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"

export default function ThemeToggle({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  const toggle = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  // Hindari mismatch hydration: render placeholder sampai tahu status tema sebenarnya.
  if (!mounted) {
    return <div className="w-8 h-8" />
  }

  const colorClass =
    variant === "dark"
      ? "text-white/60 hover:text-white hover:bg-white/5"
      : "text-text-secondary hover:text-text-primary hover:bg-paper"

  return (
    <button
      onClick={toggle}
      title={isDark ? "Mode terang" : "Mode gelap"}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${colorClass}`}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
