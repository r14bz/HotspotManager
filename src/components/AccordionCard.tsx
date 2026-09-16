"use client"

import { ChevronDown } from "lucide-react"
import { ReactNode } from "react"

export default function AccordionCard({
  title,
  subtitle,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="bg-surface rounded-xl border border-line overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
            {subtitle ? (
              <p className="text-xs text-text-secondary mt-0.5 truncate">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={
            "w-4 h-4 text-text-muted flex-shrink-0 transition-transform " +
            (isOpen ? "rotate-180" : "")
          }
        />
      </button>
      {isOpen ? (
        <div className="px-5 pb-5 space-y-4 border-t border-line pt-4">{children}</div>
      ) : null}
    </div>
  )
}
