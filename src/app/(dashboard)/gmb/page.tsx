"use client";

import { useState, useEffect } from "react";
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
  CheckCircle2,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type GmbTab = "reviews" | "posts" | "magic-qr" | "connect" | "audit" | "growth";

export default function GmbPage() {
  const [activeTab, setActiveTab] = useState<GmbTab>("reviews");
  const [postsSubTab, setPostsSubTab] = useState<"create" | "scheduled">("create");
  const [storefrontName, setStorefrontName] = useState<string>("Loading Business Profile...");
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(false);

  useEffect(() => {
    async function fetchStorefront() {
      try {
        const res = await fetch("/api/gmb/config");
        const data = await res.json();
        if (data?.activeLocation?.location_name) {
          setStorefrontName(data.activeLocation.location_name);
        } else if (data?.locations?.[0]?.location_name) {
          setStorefrontName(data.locations[0].location_name);
        } else {
          setStorefrontName("Configure Storefront");
        }
        setIsGoogleConnected(!!data?.connected);
      } catch {
        setStorefrontName("My Business Profile");
      }
    }
    fetchStorefront();
  }, []);

  const featureCards = [
    {
      step: "01",
      title: "AI POST GENERATION",
      desc: "Create engaging GMB posts instantly with AI assistance",
      tab: "posts" as GmbTab,
      subTab: "create" as const,
      icon: PenTool,
    },
    {
      step: "02",
      title: "SMART SCHEDULING",
      desc: "Auto-schedule posts at optimal times for maximum reach",
      tab: "posts" as GmbTab,
      subTab: "scheduled" as const,
      icon: Clock,
    },
    {
      step: "03",
      title: "REVIEW MANAGEMENT",
      desc: "Respond to reviews with AI-powered suggestions",
      tab: "reviews" as GmbTab,
      subTab: null,
      icon: MessageSquare,
    },
    {
      step: "04",
      title: "MAGIC QR",
      desc: "Filter negative reviews with smart QR technology",
      tab: "magic-qr" as GmbTab,
      subTab: null,
      icon: QrCode,
    },
  ];

  const tabs = [
    {
      id: "reviews" as GmbTab,
      label: "Review Management & AI Replies",
      icon: MessageSquare,
      badge: "AI Replies",
    },
    {
      id: "posts" as GmbTab,
      label: "AI Posts & Smart Scheduling",
      icon: Sparkles,
      badge: "Posts Suite",
    },
    {
      id: "magic-qr" as GmbTab,
      label: "Magic QR (Negative Review Filter)",
      icon: QrCode,
      badge: "Funnel",
    },
    {
      id: "connect" as GmbTab,
      label: "Business Profile (1 Dedicated)",
      icon: Store,
      badge: "1:1 Profile",
    },
    {
      id: "audit" as GmbTab,
      label: "Local SEO & Audit",
      icon: SearchCheck,
      badge: "SEO 92%",
    },
    {
      id: "growth" as GmbTab,
      label: "Growth Score & Insights",
      icon: TrendingUp,
      badge: "+28%",
    },
  ];

  const handleCardClick = (tab: GmbTab, subTab: "create" | "scheduled" | null) => {
    setActiveTab(tab);
    if (subTab) {
      setPostsSubTab(subTab);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Professional Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/90 to-amber-500/5 p-5 rounded-3xl border border-border/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
              <Store className="size-3" /> Official Google Business Suite
            </span>
            <span className="text-[11px] text-muted-foreground">• 1 Business Account Dedicated</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            {storefrontName}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Centralized Google storefront command center: AI review replies, automated smart scheduling, and 5-star QR funnel.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("connect")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors text-foreground"
          >
            <Building2 className="size-3.5 text-primary" />
            <span>Profile Settings</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
            <CheckCircle2 className="size-3.5" />
            <span>{isGoogleConnected ? "Google Synced" : "Storefront Active"}</span>
          </div>
        </div>
      </div>

      {/* 4 Feature Pillars (Exact 1:1 Match with User's Photo) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {featureCards.map((feat) => {
          // Precise active calculation
          let isActive = false;
          if (feat.step === "01") {
            isActive = activeTab === "posts" && postsSubTab === "create";
          } else if (feat.step === "02") {
            isActive = activeTab === "posts" && postsSubTab === "scheduled";
          } else if (feat.step === "03") {
            isActive = activeTab === "reviews";
          } else if (feat.step === "04") {
            isActive = activeTab === "magic-qr";
          }

          return (
            <button
              key={feat.step}
              type="button"
              onClick={() => handleCardClick(feat.tab, feat.subTab)}
              className={cn(
                "group relative text-left rounded-3xl p-6 border transition-all duration-300 overflow-hidden flex flex-col justify-between min-h-[190px]",
                isActive
                  ? "bg-card border-amber-500 shadow-xl shadow-amber-500/10 ring-2 ring-amber-500/30 -translate-y-0.5"
                  : "bg-card/70 hover:bg-card border-border/80 hover:border-amber-500/40 hover:shadow-md"
              )}
            >
              {/* Subtle Step watermark in bottom-right */}
              <span className="absolute -bottom-3 -right-1 text-7xl font-black text-muted/10 select-none pointer-events-none group-hover:text-amber-500/10 transition-colors">
                {feat.step}
              </span>

              {/* Top Row: Icon inside yellow circle badge & Step number */}
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    "size-12 rounded-2xl flex items-center justify-center transition-all duration-200",
                    isActive
                      ? "bg-amber-500/20 text-amber-500 border border-amber-500/30 scale-105"
                      : "bg-amber-500/10 text-amber-500 border border-amber-500/20 group-hover:scale-105"
                  )}
                >
                  <feat.icon className="size-5 text-amber-500" />
                </div>
                <span className="text-xs font-mono font-extrabold text-muted-foreground/60 tracking-wider">
                  {feat.step}
                </span>
              </div>

              {/* Middle: Title & Description */}
              <div className="mt-4 space-y-1.5 z-10">
                <h3 className="text-xs sm:text-sm font-black tracking-wider uppercase text-foreground group-hover:text-amber-500 transition-colors">
                  {feat.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {feat.desc}
                </p>
              </div>

              {/* Bottom: Explore link */}
              <div className="mt-4 pt-2.5 border-t border-border/50 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground group-hover:text-amber-500 transition-colors z-10">
                <span>EXPLORE</span>
                <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Primary Section Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/70 pb-px [scrollbar-width:none]">
        {tabs.map((tab) => {
          const isTabActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 rounded-t-2xl px-4 py-3 text-xs font-bold transition-all whitespace-nowrap",
                isTabActive
                  ? "bg-card text-foreground border-t-2 border-x border-border shadow-xs border-t-amber-500 before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:bg-amber-500"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <tab.icon className={cn("size-3.5", isTabActive ? "text-amber-500" : "text-muted-foreground")} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
                    isTabActive
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
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
      <div className="min-w-0 animate-in fade-in duration-200">
        {activeTab === "reviews" && <GmbReviews />}
        {activeTab === "posts" && <GmbPostsScheduler initialTab={postsSubTab} />}
        {activeTab === "magic-qr" && <GmbMagicQr />}
        {activeTab === "connect" && <GbpConnect />}
        {activeTab === "audit" && <GmbAudit />}
        {activeTab === "growth" && <GmbGrowthScore />}
      </div>
    </div>
  );
}
