"use client";

import { useState } from "react";
import { GbpConnect } from "@/components/gmb/gbp-connect";
import { GmbReviews } from "@/components/gmb/gmb-reviews";
import { GmbAudit } from "@/components/gmb/gmb-audit";
import { GmbGrowthScore } from "@/components/gmb/gmb-growth-score";
import {
  Store,
  MessageSquare,
  SearchCheck,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type GmbTab = "connect" | "reviews" | "audit" | "growth";

export default function GmbPage() {
  const [activeTab, setActiveTab] = useState<GmbTab>("connect");

  const tabs = [
    {
      id: "connect" as GmbTab,
      label: "Business Profile & Connect",
      icon: Store,
      badge: null,
    },
    {
      id: "reviews" as GmbTab,
      label: "Reviews & AI Replies",
      icon: MessageSquare,
      badge: "AI Powered",
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
            Manage your Google storefront, automate AI review replies, audit local SEO signals, and track visibility growth.
          </p>
        </div>
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
        {activeTab === "connect" && <GbpConnect />}
        {activeTab === "reviews" && <GmbReviews />}
        {activeTab === "audit" && <GmbAudit />}
        {activeTab === "growth" && <GmbGrowthScore />}
      </div>
    </div>
  );
}
