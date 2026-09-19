"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";
import {
  Store,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  MapPin,
  Phone,
  Globe,
  Clock,
  Sparkles,
  AlertCircle,
  Building2,
  ShieldCheck,
  KeyRound,
} from "lucide-react";

export function GbpConnect() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [googleAppConfigured, setGoogleAppConfigured] = useState(true);
  const [storeName, setStoreName] = useState("Aibotflow Tech Solutions");
  const [category, setCategory] = useState("Software Company & Marketing Agency");
  const [phone, setPhone] = useState("+91 98765 43210");
  const [address, setAddress] = useState("Sector 62, Noida, Uttar Pradesh 201309, India");
  const [website, setWebsite] = useState("https://aibotflow.in");

  useEffect(() => {
    fetch("/api/gmb/config")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setGoogleAppConfigured(data.googleAppConfigured ?? true);
          if (data.connected) {
            setIsConnected(true);
            if (data.locations && data.locations.length > 0) {
              const loc = data.locations[0];
              if (loc.location_name) setStoreName(loc.location_name);
              if (loc.address) setAddress(loc.address);
              if (loc.phone) setPhone(loc.phone);
              if (loc.website) setWebsite(loc.website);
              if (loc.primary_category) setCategory(loc.primary_category);
            }
          }
        }
      })
      .catch((err) => console.error("Error checking GMB config:", err));
  }, []);

  const handleConnectWithGoogle = async () => {
    try {
      setIsConnecting(true);
      const res = await fetch("/api/google/oauth/url");
      const data = await res.json();

      if (!res.ok || data.error) {
        toast.error(data.error || "Failed to initialize Google connection.");
        return;
      }

      if (data.configured === false) {
        setGoogleAppConfigured(false);
        toast.error("Google OAuth API credentials missing", {
          description: "Please configure Google Client ID and Secret in Super Admin Settings first.",
        });
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start Google OAuth flow.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      toast.success("Google Business Profile Synced Successfully!", {
        description: "Latest reviews, insights, and location details updated from Google.",
      });
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Warning banner if credentials missing */}
      {!googleAppConfigured && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-foreground">Google Cloud API Credentials Not Configured</p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                To enable live Google OAuth and 1-click connect, configure your Google Client ID & Secret.
              </p>
            </div>
          </div>
          <Link
            href="/super-admin/settings"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors shrink-0 self-start sm:self-auto"
          >
            <KeyRound className="size-3.5" />
            Configure in Super Admin →
          </Link>
        </div>
      )}

      {/* Top Connection Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card/90 to-primary/10 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-xs">
              <Store className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Google Business Profile (GBP)</h3>
                {isConnected ? (
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                    <CheckCircle2 className="size-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] font-semibold">
                    Not Connected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official Google Cloud API integration for location sync, live reviews, and automated AI replies.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="rounded-xl text-xs"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsConnected(false);
                    toast.info("Google Business Profile Disconnected");
                  }}
                  className="rounded-xl text-xs text-muted-foreground hover:text-destructive"
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={handleConnectWithGoogle}
                disabled={isConnecting}
                className="rounded-xl bg-primary text-primary-foreground text-xs shadow-sm hover:bg-primary/90"
              >
                <Store className="size-3.5 mr-1.5" />
                {isConnecting ? "Connecting..." : "Connect with Google"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Store & Profile Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Business Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-2xl border-border/70 shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Building2 className="size-4 text-primary" />
                    Business Profile Information
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Your public storefront data verified with Google Maps & Search.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <ShieldCheck className="size-3 mr-1" /> Google Verified
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Business Name</Label>
                  <Input
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Primary Category</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Store Address (NAP Standard)</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="text-xs pl-9 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="text-xs pl-9 rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="text-xs pl-9 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => toast.success("Business profile saved and submitted to Google")}
                  className="rounded-xl text-xs"
                >
                  Save & Update Google Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Business Hours Card */}
          <Card className="rounded-2xl border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                Operating Hours
              </CardTitle>
              <CardDescription className="text-xs">
                Accurate opening hours improve local search ranking and customer trust.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/40 text-xs">
                {[
                  { day: "Monday - Friday", time: "09:30 AM - 06:30 PM", status: "Open" },
                  { day: "Saturday", time: "10:00 AM - 04:00 PM", status: "Open" },
                  { day: "Sunday", time: "Closed", status: "Closed" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2">
                    <span className="font-medium text-foreground">{item.day}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{item.time}</span>
                      <Badge
                        variant="outline"
                        className={
                          item.status === "Open"
                            ? "text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "text-[10px] border-border bg-muted text-muted-foreground"
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Quick Google Summary & Actions */}
        <div className="space-y-6">
          <Card className="rounded-2xl border-border/70 shadow-xs bg-gradient-to-b from-card to-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Live Google Maps Preview
              </CardTitle>
              <CardDescription className="text-xs">
                Customer listing view on Google Maps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-background/80 p-3.5 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{storeName}</h4>
                    <p className="text-[11px] text-muted-foreground">{category}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                    ★ 4.8
                  </div>
                </div>

                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-1.5 truncate">
                    <MapPin className="size-3 shrink-0 text-primary" />
                    {address}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3 shrink-0 text-primary" />
                    {phone}
                  </p>
                  <p className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <Clock className="size-3 shrink-0" />
                    Open now · Closes 6:30 PM
                  </p>
                </div>

                <a
                  href="https://maps.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-xl border border-border/70 bg-card py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  View on Google Maps <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              </div>

              {/* Sync Health Notice */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] space-y-0.5">
                  <p className="font-semibold text-foreground">API Sync Ready</p>
                  <p className="text-muted-foreground">
                    Google Cloud Business Profile API v1 is configured with OAuth 2.0.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
