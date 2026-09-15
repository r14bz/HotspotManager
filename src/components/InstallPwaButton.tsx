"use client"

import { useEffect, useState } from "react"
import { Download, CheckCircle2, Share } from "lucide-react"

export default function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    setInstalled(isStandalone)

    const ua = window.navigator.userAgent
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !isStandalone)

    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener("beforeinstallprompt", handler)

    const installedHandler = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener("appinstalled", installedHandler)

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", installedHandler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  if (installed) {
    return (
      <div className="flex items-center gap-2 text-sm text-signal-dark bg-signal-soft rounded-lg px-3 py-2.5">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        Aplikasi sudah terpasang di perangkat ini
      </div>
    )
  }

  if (isIos) {
    return (
      <div>
        <button
          onClick={() => setShowIosHelp((v) => !v)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-ink hover:bg-ink-soft text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Install Aplikasi
        </button>
        {showIosHelp && (
          <div className="mt-3 flex items-start gap-2 bg-paper border border-line rounded-lg p-3 text-sm text-text-secondary">
            <Share className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Di Safari: ketuk ikon <strong>Share</strong> di bawah, lalu pilih{" "}
              <strong>"Add to Home Screen"</strong>.
            </span>
          </div>
        )}
      </div>
    )
  }

  if (!deferredPrompt) {
    return (
      <p className="text-xs text-text-muted">
        Buka halaman ini lewat Chrome untuk memasang sebagai aplikasi.
      </p>
    )
  }

  return (
    <button
      onClick={handleInstall}
      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-ink hover:bg-ink-soft text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
    >
      <Download className="w-4 h-4" />
      Install Aplikasi
    </button>
  )
}
