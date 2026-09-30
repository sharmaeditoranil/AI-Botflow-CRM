"use client";

import { useState, useEffect } from "react";
import { GbpConnect } from "@/components/gmb/gbp-connect";
import { GmbReviews } from "@/components/gmb/gmb-reviews";
import { GmbMagicQr } from "@/components/gmb/gmb-magic-qr";
import { GmbPostsScheduler } from "@/components/gmb/gmb-posts-scheduler";
import {
  Store,
  MessageSquare,
  Sparkles,
  Calendar,
  QrCode,
  Building2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GmbTab = "reviews" | "posts" | "scheduling" | "magic-qr" | "connect";

export default function GmbPage() {
  const [activeTab, setActiveTab] = useState<GmbTab>("reviews");
  const [storefrontName, setStorefrontName] = useState<string>("Loading Business Profile...");
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(false);
  const [activeLocation, setActiveLocation] = useState<any>(null);

  useEffect(() => {
    async function fetchStorefront() {
      try {
        const res = await fetch("/api/gmb/config");
        const data = await res.json();
        const active = data?.activeLocation || data?.locations?.[0];
        if (active?.location_name) {
          setStorefrontName(active.location_name);
          setActiveLocation(active);
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

  const tabs = [
    {
      id: "reviews" as GmbTab,
      label: "Reviews",
      icon: MessageSquare,
      badge: "AI Replies",
    },
    {
      id: "posts" as GmbTab,
      label: "AI Posts",
      icon: Sparkles,
      badge: "Generator",
    },
    {
      id: "scheduling" as GmbTab,
      label: "Scheduling",
      icon: Calendar,
      badge: "Auto-Queue",
    },
    {
      id: "magic-qr" as GmbTab,
      label: "Magic QR",
      icon: QrCode,
      badge: "5★ Funnel",
    },
    {
      id: "connect" as GmbTab,
      label: "Business Profile",
      icon: Store,
      badge: "1:1 Connected",
    },
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* Top Bar: Business Name + Google Synced + Profile Settings */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/80 p-4 sm:p-5 rounded-2xl border border-border/80 shadow-xs backdrop-blur-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
              <Store className="size-3" /> Google Business Suite
            </span>
            <span className="text-[11px] text-muted-foreground">• 1 Business Account Dedicated</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            {storefrontName}
          </h1>
        </div>

        {/* Status + Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all",
              isGoogleConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-500"
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                isGoogleConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              )}
            />
            <span>{isGoogleConnected ? "Google Synced" : "Not Synced"}</span>
          </div>

          <Button
            variant={activeTab === "connect" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("connect")}
            className={cn(
              "rounded-xl text-xs gap-1.5 h-8 font-bold shadow-xs",
              activeTab === "connect" && "bg-amber-500 text-slate-950 hover:bg-amber-600"
            )}
          >
            <Building2 className="size-3.5" />
            <span>Profile Settings</span>
          </Button>
        </div>
      </div>

      {/* Clean Feature Tabs Navigation: Reviews | AI Posts | Scheduling | Magic QR | Business Profile */}
      <div className="flex items-center gap-1.5 p-1.5 bg-muted/40 rounded-2xl border border-border/80 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                isActive
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 scale-[1.01]"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/70"
              )}
            >
              <tab.icon className={cn("size-3.5", isActive ? "text-slate-950" : "text-muted-foreground")} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide",
                    isActive
                      ? "bg-slate-950/20 text-slate-950"
                      : "bg-muted text-muted-foreground border border-border/60"
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Module Tab Content */}
      <div className="min-w-0 animate-in fade-in duration-200">
        {activeTab === "reviews" && <GmbReviews />}
        {activeTab === "posts" && <GmbPostsScheduler initialTab="create" />}
        {activeTab === "scheduling" && <GmbPostsScheduler initialTab="scheduled" />}
        {activeTab === "magic-qr" && <GmbMagicQr />}
        {activeTab === "connect" && <GbpConnect />}
      </div>
    </div>
  );
}
