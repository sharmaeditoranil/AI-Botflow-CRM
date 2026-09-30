"use client";

import { useState } from "react";
import { GbpConnect } from "@/components/gmb/gbp-connect";
import { GmbReviews } from "@/components/gmb/gmb-reviews";
import { GmbAudit } from "@/components/gmb/gmb-audit";
import { GmbGrowthScore } from "@/components/gmb/gmb-growth-score";
import { GmbMagicQr } from "@/components/gmb/gmb-magic-qr";
import { GmbPostsScheduler } from "@/components/gmb/gmb-posts-scheduler";
import {
  Store,
  MessageSquare,
  SearchCheck,
  TrendingUp,
  Sparkles,
  Clock,
  QrCode,
  ArrowUpRight,
  PenTool,
} from "lucide-react";
import { cn } from "@/lib/utils";

type GmbTab = "posts" | "reviews" | "magic-qr" | "connect" | "audit" | "growth";

export default function GmbPage() {
  const [activeTab, setActiveTab] = useState<GmbTab>("reviews");

  const featureCards = [
    {
      step: "01",
      title: "AI POST GENERATION",
      desc: "Create engaging GMB posts instantly with AI assistance",
      tab: "posts" as GmbTab,
      icon: PenTool,
      accent: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      step: "02",
      title: "SMART SCHEDULING",
      desc: "Auto-schedule posts at optimal times for maximum reach",
      tab: "posts" as GmbTab,
      icon: Clock,
      accent: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      step: "03",
      title: "REVIEW MANAGEMENT",
      desc: "Respond to reviews with AI-powered suggestions",
      tab: "reviews" as GmbTab,
      icon: MessageSquare,
      accent: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      step: "04",
      title: "MAGIC QR",
      desc: "Filter negative reviews with smart QR technology",
      tab: "magic-qr" as GmbTab,
      icon: QrCode,
      accent: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
  ];

  const tabs = [
    {
      id: "reviews" as GmbTab,
      label: "Review Management & AI Replies",
      icon: MessageSquare,
      badge: "AI Powered",
    },
    {
      id: "posts" as GmbTab,
      label: "AI Posts & Smart Scheduling",
      icon: Sparkles,
      badge: "New",
    },
    {
      id: "magic-qr" as GmbTab,
      label: "Magic QR (Negative Filter)",
      icon: QrCode,
      badge: "Hot",
    },
    {
      id: "connect" as GmbTab,
      label: "Business Profile & Connect",
      icon: Store,
      badge: null,
    },
    {
      id: "audit" as GmbTab,
      label: "Local SEO & Audit",
      icon: SearchCheck,
      badge: "92%",
    },
    {
      id: "growth" as GmbTab,
      label: "Growth Score & Insights",
      icon: TrendingUp,
      badge: "+28%",
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl flex items-center gap-2.5">
            <Store className="size-6 text-primary" />
            Google Business Profile (GMB) Suite
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Automate AI review replies, generate & schedule posts, filter negative reviews with Magic QR, and audit local SEO.
          </p>
        </div>
      </div>

      {/* 4 Feature Banner Cards (Matching User's Screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {featureCards.map((feat) => {
          const isActive =
            activeTab === feat.tab ||
            (feat.tab === "posts" && activeTab === "posts");
          return (
            <button
              key={feat.step}
              type="button"
              onClick={() => setActiveTab(feat.tab)}
              className={cn(
                "group relative text-left rounded-2xl p-5 border transition-all duration-200 overflow-hidden flex flex-col justify-between min-h-[170px]",
                isActive
                  ? "bg-card border-amber-500/60 shadow-md ring-1 ring-amber-500/30"
                  : "bg-card/60 hover:bg-card border-border/70 hover:border-amber-500/40"
              )}
            >
              {/* Subtle Step watermark in background */}
              <span className="absolute -bottom-2 -right-1 text-6xl font-black text-muted/15 select-none pointer-events-none group-hover:text-amber-500/10 transition-colors">
                {feat.step}
              </span>

              {/* Top Row: Icon & Step */}
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    "size-10 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-110",
                    feat.accent
                  )}
                >
                  <feat.icon className="size-5" />
                </div>
                <span className="text-[11px] font-mono font-bold text-muted-foreground/70">
                  {feat.step}
                </span>
              </div>

              {/* Middle: Title & Description */}
              <div className="mt-3 space-y-1 z-10">
                <h3 className="text-xs font-black tracking-wider uppercase text-foreground group-hover:text-primary transition-colors">
                  {feat.title}
                </h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {feat.desc}
                </p>
              </div>

              {/* Bottom: Explore link */}
              <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-amber-500 transition-colors z-10">
                <span>EXPLORE</span>
                <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 pb-px [scrollbar-width:none]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "bg-card text-foreground border-t border-x border-border/70 shadow-xs before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:bg-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <tab.icon className={cn("size-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider",
                    isActive
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-muted text-muted-foreground border border-border"
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab View */}
      <div className="min-w-0">
        {activeTab === "reviews" && <GmbReviews />}
        {activeTab === "posts" && <GmbPostsScheduler />}
        {activeTab === "magic-qr" && <GmbMagicQr />}
        {activeTab === "connect" && <GbpConnect />}
        {activeTab === "audit" && <GmbAudit />}
        {activeTab === "growth" && <GmbGrowthScore />}
      </div>
    </div>
  );
}
