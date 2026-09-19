"use client"

import Link from 'next/link'
import { UserPlus, Briefcase, Radio, Zap, Store } from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslations } from 'next-intl'

interface Action {
  labelKey: string
  href: string
  icon: ComponentType<{ className?: string }>
  tint: string
  bg: string
  border: string
}

const ACTIONS: Action[] = [
  {
    labelKey: 'newContact',
    href: '/contacts',
    icon: UserPlus,
    tint: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/25',
  },
  {
    labelKey: 'newDeal',
    href: '/pipelines',
    icon: Briefcase,
    tint: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/25',
  },
  {
    labelKey: 'newBroadcast',
    href: '/broadcasts/new',
    icon: Radio,
    tint: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
  },
  {
    labelKey: 'newAutomation',
    href: '/automations/new',
    icon: Zap,
    tint: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
  },
]

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')
  
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card/90 p-3.5 shadow-xs transition-all duration-200 hover:border-border hover:shadow-md hover:scale-[1.01]"
          >
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${a.border} ${a.bg} ${a.tint} group-hover:scale-110 transition-transform`}>
              <Icon className="size-4.5" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
              {t(a.labelKey as string)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
