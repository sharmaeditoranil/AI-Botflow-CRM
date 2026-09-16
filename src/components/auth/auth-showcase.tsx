'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand/brand-logo';
import {
  Brain,
  Send,
  Zap,
  ShieldCheck,
  Star,
  Sparkles,
  CheckCircle2,
  Bot,
  MessageSquare,
  ArrowUpRight,
  Flame,
} from 'lucide-react';

export function AuthShowcase() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between border-r border-border/60 bg-gradient-to-br from-card/60 via-card/30 to-muted/20 p-8 xl:p-12 overflow-hidden">
      {/* Dynamic ambient backdrop glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-[120px] dark:bg-primary/25" />
        <div className="absolute top-1/2 -right-24 h-96 w-96 rounded-full bg-emerald-500/10 blur-[130px] dark:bg-emerald-500/15" />
        <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-purple-600/10 blur-[120px] dark:bg-purple-600/20" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8881_1px,transparent_1px),linear-gradient(to_bottom,#8881_1px,transparent_1px)] bg-[size:2.5rem_2.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,#000_60%,transparent_100%)] opacity-30" />
      </div>

      {/* Top Header: Brand & Live API Status */}
      <div className="relative z-10 flex items-center justify-between">
        <BrandLogo size={40} showText variant="glow" priority textClassName="text-2xl font-bold tracking-tight" />
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 shadow-xs backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Official Meta Cloud API v21.0
        </div>
      </div>

      {/* Middle Content */}
      <div className="relative z-10 my-auto py-8 space-y-7 max-w-xl">
        {/* Hero Title */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shadow-xs backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            Next-Gen WhatsApp CRM & AI Growth Platform
          </div>
          <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-foreground leading-[1.18]">
            Convert WhatsApp Chats into{' '}
            <span className="bg-gradient-to-r from-primary via-purple-500 to-emerald-400 bg-clip-text text-transparent">
              High-Velocity Revenue
            </span>
          </h1>
          <p className="text-sm xl:text-base text-muted-foreground leading-relaxed">
            Enterprise WhatsApp automation with autonomous AI conversation memory, dynamic broadcasts, and universal multi-platform webhooks — without per-message platform markups.
          </p>
        </div>

        {/* Live Interactive Simulation Card (Floating Preview) */}
        <div className="relative rounded-2xl border border-border/80 bg-card/80 p-4 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-primary/40 group">
          {/* Subtle gradient accent bar */}
          <div className="absolute top-0 inset-x-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary via-purple-500 to-emerald-400" />
          
          <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 font-semibold text-xs ring-1 ring-emerald-500/30">
                <span>WA</span>
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-background" />
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  Live Customer Thread
                  <span className="text-[10px] font-normal text-muted-foreground">· just now</span>
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  AI Agent Active (Auto-Reply & Memory)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                <Flame className="h-3 w-3 fill-amber-500" />
                Hot Lead (95)
              </span>
            </div>
          </div>

          {/* Chat Preview Bubbles */}
          <div className="space-y-2.5 text-xs">
            {/* Customer Message */}
            <div className="flex justify-start">
              <div className="max-w-[82%] rounded-2xl rounded-tl-xs bg-muted/70 px-3.5 py-2 text-foreground border border-border/40 shadow-xs">
                <p className="leading-snug">
                  Hi! Can your CRM auto-qualify leads from our website webhook and send instant WhatsApp brochures?
                </p>
                <span className="mt-1 block text-[10px] text-muted-foreground text-right">10:42 AM</span>
              </div>
            </div>

            {/* AI Agent Automated Reply */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-gradient-to-r from-primary/90 to-purple-600/90 text-primary-foreground px-3.5 py-2 shadow-md">
                <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold text-primary-foreground/90">
                  <Sparkles className="h-3 w-3" />
                  <span>AI Agent · Instant 0.3s response</span>
                </div>
                <p className="leading-snug">
                  Absolutely! Aibotflow instantly syncs leads via Zapier/n8n/Webhooks, attaches tailored PDF catalogs, and scores intent automatically.
                </p>
                <span className="mt-1 block text-[10px] text-primary-foreground/80 text-right">10:42 AM · Sent</span>
              </div>
            </div>
          </div>

          {/* Intelligence Tags Chip Strip */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
              <Brain className="h-3 w-3" />
              Memory Synced
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
              <Zap className="h-3 w-3" />
              Webhook: n8n Flow
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Opt-out Guard Enabled
            </span>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-border/70 bg-card/50 p-3.5 backdrop-blur-md">
          <div className="text-center border-r border-border/50 pr-2">
            <div className="text-lg xl:text-xl font-extrabold text-foreground tracking-tight">99.9%</div>
            <div className="text-[11px] text-muted-foreground font-medium">Delivery Rate</div>
          </div>
          <div className="text-center border-r border-border/50 px-2">
            <div className="text-lg xl:text-xl font-extrabold text-foreground tracking-tight">&lt; 1s</div>
            <div className="text-[11px] text-muted-foreground font-medium">AI Response Time</div>
          </div>
          <div className="text-center pl-2">
            <div className="text-lg xl:text-xl font-extrabold text-emerald-500 tracking-tight">Zero</div>
            <div className="text-[11px] text-muted-foreground font-medium">Per-Message Markup</div>
          </div>
        </div>
      </div>

      {/* Bottom Trust & Security Bar */}
      <div className="relative z-10 flex items-center justify-between border-t border-border/60 pt-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <div className="flex -space-x-1.5 overflow-hidden">
            <span className="inline-flex h-6 w-6 rounded-full ring-2 ring-background bg-purple-600 text-[10px] font-bold text-white items-center justify-center">R</span>
            <span className="inline-flex h-6 w-6 rounded-full ring-2 ring-background bg-blue-600 text-[10px] font-bold text-white items-center justify-center">A</span>
            <span className="inline-flex h-6 w-6 rounded-full ring-2 ring-background bg-emerald-600 text-[10px] font-bold text-white items-center justify-center">S</span>
            <span className="inline-flex h-6 w-6 rounded-full ring-2 ring-background bg-amber-600 text-[10px] font-bold text-white items-center justify-center">V</span>
          </div>
          <div className="flex items-center gap-1 text-amber-500 font-semibold">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
              ))}
            </div>
            <span className="text-foreground ml-1 text-xs">5.0</span>
            <span className="text-[11px] text-muted-foreground font-normal">· 1,200+ teams</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>256-bit SSL & GDPR Compliant</span>
        </div>
      </div>
    </div>
  );
}

