'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand/brand-logo';
import {
  Brain,
  Send,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Star,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

export function AuthShowcase() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between border-r border-border/60 bg-muted/20 p-8 xl:p-12">
      {/* Decorative inner gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between">
        <BrandLogo size={42} showText variant="glow" priority textClassName="text-2xl font-bold tracking-tight" />
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Official Meta Cloud API
        </div>
      </div>

      {/* Middle Hero Content */}
      <div className="relative z-10 my-auto py-10 space-y-8 max-w-xl">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Next-Gen WhatsApp CRM & AI Automation
          </div>
          <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            Turn Customer Chats into{' '}
            <span className="bg-linear-to-r from-primary via-purple-500 to-emerald-500 bg-clip-text text-transparent">
              High-Converting Sales
            </span>
          </h1>
          <p className="text-sm xl:text-base text-muted-foreground leading-relaxed">
            The enterprise-grade WhatsApp platform built for speed. Automate responses with AI memory, broadcast dynamic media campaigns, and manage leads without per-message platform markups.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="space-y-3.5">
          <div className="group flex items-start gap-3.5 rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-xs backdrop-blur-md transition-all hover:border-primary/40 hover:bg-card/90">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 transition-colors group-hover:bg-purple-500/20">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                AI Agent with Conversation Memory
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                Remembers previous inquiries, CRM agent notes, and auto-qualifies high-intent leads in real-time.
              </p>
            </div>
          </div>

          <div className="group flex items-start gap-3.5 rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-xs backdrop-blur-md transition-all hover:border-primary/40 hover:bg-card/90">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                High-Conversion Media Broadcasts
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                Direct file upload for Images, PDFs, and Videos with dynamic variable mapping & automated opt-out protection.
              </p>
            </div>
          </div>

          <div className="group flex items-start gap-3.5 rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-xs backdrop-blur-md transition-all hover:border-primary/40 hover:bg-card/90">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors group-hover:bg-amber-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Universal Multi-Platform Webhooks
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                Connect instantly with n8n, Pabbly, Zapier, Make, and website lead forms with smart phone parsing.
              </p>
            </div>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-border/70 bg-card/40 p-3.5 backdrop-blur-md">
          <div className="text-center border-r border-border/50 pr-2">
            <div className="text-lg xl:text-xl font-bold text-foreground">99.9%</div>
            <div className="text-[11px] text-muted-foreground">Delivery Rate</div>
          </div>
          <div className="text-center border-r border-border/50 px-2">
            <div className="text-lg xl:text-xl font-bold text-foreground">10,000+</div>
            <div className="text-[11px] text-muted-foreground">Daily Messages</div>
          </div>
          <div className="text-center pl-2">
            <div className="text-lg xl:text-xl font-bold text-emerald-500">Zero</div>
            <div className="text-[11px] text-muted-foreground">Message Markup</div>
          </div>
        </div>
      </div>

      {/* Bottom Trust Badge */}
      <div className="relative z-10 flex items-center justify-between border-t border-border/60 pt-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5 overflow-hidden">
            <span className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-purple-500/80 text-[10px] font-bold text-white flex items-center justify-center">R</span>
            <span className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-blue-500/80 text-[10px] font-bold text-white flex items-center justify-center">A</span>
            <span className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-emerald-500/80 text-[10px] font-bold text-white flex items-center justify-center">S</span>
          </div>
          <div className="flex items-center gap-1 text-amber-500 font-medium">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <span className="ml-1 text-foreground font-semibold">5.0</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>AES-256 Cloud Security</span>
        </div>
      </div>
    </div>
  );
}
