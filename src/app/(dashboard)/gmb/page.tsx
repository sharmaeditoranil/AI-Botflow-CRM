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
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GmbSelectProfileModal } from "@/components/gmb/gmb-select-profile-modal";

type GmbTab = "reviews" | "posts" | "scheduling" | "magic-qr" | "connect";

export default function GmbPage() {
  const [activeTab, setActiveTab] = useState<GmbTab>("reviews");
  const [storefrontName, setStorefrontName] = useState<string>("Loading Business Profile...");
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(false);
  const [activeLocation, setActiveLocation] = useState<any>(null);
  const [totalLocations, setTotalLocations] = useState<number>(0);
  const [isSelectModalOpen, setIsSelectModalOpen] = useState<boolean>(false);

  const fetchStorefront = async () => {
    try {
      const res = await fetch("/api/gmb/config");
      const data = await res.json();
      setIsGoogleConnected(!!data?.connected);
      setTotalLocations(data?.totalLocations || data?.locations?.length || 0);

      const active = data?.activeLocation || (data?.locations?.length === 1 ? data?.locations[0] : null);
      if (active?.location_name) {
        setStorefrontName(active.location_name);
        setActiveLocation(active);
      } else {
        setActiveLocation(null);
        if (data?.connected) {
          setStorefrontName("Select Business Profile");
          // If connected with multiple profiles but none selected yet, open selection modal
          if ((data?.totalLocations || data?.locations?.length) > 1) {
            setIsSelectModalOpen(true);
          }
        } else {
          setStorefrontName("Configure Storefront");
        }
      }
    } catch {
      setStorefrontName("My Business Profile");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStorefront();

    // Check url search params on mount
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("select_profile") === "true") {
        setIsSelectModalOpen(true);
        // Clean URL parameter without page reload
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const handleProfileSelected = (newLoc: any) => {
    setActiveLocation(newLoc);
    setStorefrontName(newLoc.location_name || "My Business Profile");
    fetchStorefront();
  };

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
      {/* Top Bar: Business Name + Google Synced + Change Profile + Profile Settings */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/80 p-4 sm:p-5 rounded-2xl border border-border/80 shadow-xs backdrop-blur-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
              <Store className="size-3" /> Google Business Suite
            </span>
            <span className="text-[11px] text-muted-foreground">• 1 Business Dedicated</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            {storefrontName}
          </h1>
        </div>

        {/* Status + Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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

          {/* Change Business Profile button */}
          {isGoogleConnected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSelectModalOpen(true)}
              className="rounded-xl text-xs gap-1.5 h-8 font-bold border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 hover:text-amber-400 shadow-xs"
            >
              <Layers className="size-3.5" />
              <span className="hidden sm:inline">Change Profile</span>
              <span className="sm:hidden">Change</span>
              {totalLocations > 1 && (
                <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono">
                  {totalLocations}
                </span>
              )}
            </Button>
          )}

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

      {/* Action Required Banner if multiple profiles connected but none actively chosen */}
      {isGoogleConnected && !activeLocation && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-foreground animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="size-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-500">Google Account Connected — Select Business Profile</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalLocations > 1
                  ? `${totalLocations} business profiles are available in your Google account. Please choose which profile to sync.`
                  : "Please select which profile to connect to your AiBotFlow CRM suite."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setIsSelectModalOpen(true)}
            className="text-xs font-bold rounded-xl h-8 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 shrink-0 shadow-xs"
          >
            <Layers className="size-3.5 mr-1.5" /> Select Profile Now
          </Button>
        </div>
      )}

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

      {/* Select Business Profile Modal */}
      <GmbSelectProfileModal
        open={isSelectModalOpen}
        onOpenChange={setIsSelectModalOpen}
        activeLocationId={activeLocation?.id}
        onProfileSelected={handleProfileSelected}
      />
    </div>
  );
}
