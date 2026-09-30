"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Store,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  MapPin,
  Phone,
  Globe,
  Sparkles,
  ShieldCheck,
  Building2,
  Save,
  LogOut,
  Tag,
  AlertCircle,
  HelpCircle,
  Layers,
} from "lucide-react";
import { GmbSelectProfileModal } from "./gmb-select-profile-modal";

export interface GmbLocation {
  id: string;
  location_id: string;
  location_name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  primary_category: string | null;
  is_verified?: boolean;
}

export function GbpConnect() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [googleAppConfigured, setGoogleAppConfigured] = useState(true);
  const [totalLocationsCount, setTotalLocationsCount] = useState<number>(0);
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

  // Single dedicated location for this account
  const [location, setLocation] = useState<GmbLocation | null>(null);

  // Form states for editing
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/gmb/config");
      const data = await res.json();

      if (data) {
        setGoogleAppConfigured(data.googleAppConfigured ?? true);
        setTotalLocationsCount(data.totalLocations || data.locations?.length || 0);
        if (data.connected) {
          setIsConnected(true);
          setConnectedEmail(data.account?.email || "Google Connected");
        } else {
          setIsConnected(false);
          setConnectedEmail(null);
        }

        // 1 Account = 1 Single Primary Location
        const primary = data.activeLocation || (data.locations?.length === 1 ? data.locations[0] : null);
        if (primary) {
          setLocation(primary);
          setStoreName(primary.location_name || "");
          setCategory(primary.primary_category || "Local Business");
          setPhone(primary.phone || "");
          setAddress(primary.address || "");
          setWebsite(primary.website || "");
        } else {
          setLocation(null);
        }
      }
    } catch (err: any) {
      console.error("Failed to load GMB configuration:", err);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleConnectGoogle = async () => {
    try {
      setIsConnecting(true);
      const res = await fetch("/api/google/oauth/url");
      const data = await res.json();

      if (data.configured && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(
          data.error || "Google Client ID is not configured. Please check Super Admin Settings."
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate Google OAuth");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect this Google Business Profile?")) return;
    try {
      const res = await fetch("/api/gmb/disconnect", { method: "POST" });
      if (res.ok) {
        toast.success("Disconnected Google Business Profile successfully.");
        setIsConnected(false);
        setConnectedEmail(null);
        await loadConfig();
      } else {
        toast.error("Failed to disconnect Google account");
      }
    } catch {
      toast.error("Error disconnecting account");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      toast.error("Business name cannot be empty");
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch("/api/gmb/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: location?.id || undefined,
          location_name: storeName.trim(),
          primary_category: category.trim(),
          phone: phone.trim(),
          address: address.trim(),
          website: website.trim(),
          is_active: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Business profile saved successfully!");
        setIsEditing(false);
        await loadConfig();
      } else {
        toast.error(data.error || "Failed to save profile");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncWithGoogle = async () => {
    try {
      setIsSyncing(true);
      const res = await fetch("/api/gmb/sync", { method: "POST" });
      const data = await res.json();
      if (data.pendingApproval) {
        toast.info(data.message || "Google Business API is currently pending with Google.", {
          duration: 6000,
        });
      } else if (data.success) {
        toast.success(data.message || "Profile and reviews synchronized from Google!");
        await loadConfig();
      } else {
        toast.error(data.error || "Failed to sync with Google");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error syncing with Google");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 1 Account = 1 GMB Profile Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-card via-card/95 to-primary/5 border border-border/70 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="size-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-inner">
              <Store className="size-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                  {storeName || "Your Google Business Profile"}
                </h2>
                {isConnected ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold gap-1 py-0.5">
                    <CheckCircle2 className="size-3" /> Google Account Linked
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] font-bold">
                    Setup Profile
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] font-semibold">
                  1 Account = 1 Dedicated Business
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
                Your entire CRM Suite (AI Review Replies, Magic QR Funnel, AI Posts & Smart Scheduling) is synchronized with this dedicated business storefront.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isConnected ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsSelectModalOpen(true)}
                  className="text-xs font-bold h-9 rounded-xl border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 hover:text-amber-400 gap-1.5 shadow-xs"
                >
                  <Layers className="size-3.5" />
                  <span>Change Business Profile</span>
                  {totalLocationsCount > 1 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-background/80 text-foreground font-mono">
                      {totalLocationsCount}
                    </Badge>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncWithGoogle}
                  disabled={isSyncing}
                  className="text-xs font-semibold h-9 rounded-xl border-border"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
                  {isSyncing ? "Syncing..." : "Sync from Google"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisconnect}
                  className="text-xs font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-9 rounded-xl"
                >
                  <LogOut className="size-3.5 mr-1" /> Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={handleConnectGoogle}
                disabled={isConnecting}
                className="text-xs font-bold h-9 px-5 rounded-xl bg-primary hover:bg-primary/90 text-white shadow-md gap-1.5"
              >
                <ShieldCheck className="size-4" />
                {isConnecting ? "Connecting..." : "Connect Google Account"}
              </Button>
            )}
          </div>
        </div>

        {/* Connected Email pill */}
        {connectedEmail && (
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              Connected Google Email: <strong className="text-foreground">{connectedEmail}</strong>
            </span>
            <span className="text-[11px] text-muted-foreground">
              OAuth 2.0 Security Active
            </span>
          </div>
        )}
      </div>

      {/* Action Banner if multiple profiles connected but none selected */}
      {isConnected && !location && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-foreground animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <AlertCircle className="size-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="text-xs font-bold text-amber-500">Action Required: Select Google Business Profile</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalLocationsCount > 0
                  ? `Your Google Account has ${totalLocationsCount} business profiles. Please choose which profile to sync with AiBotFlow.`
                  : "Please select which Google Business Profile should be actively connected to AiBotFlow."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setIsSelectModalOpen(true)}
            className="text-xs font-bold rounded-xl h-9 px-5 bg-amber-500 hover:bg-amber-600 text-slate-950 shrink-0 shadow-sm"
          >
            <Layers className="size-3.5 mr-1.5" /> Select Profile Now
          </Button>
        </div>
      )}

      {/* Profile Details Form & Overview */}
      <Card className="rounded-3xl border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="p-6 pb-4 border-b border-border/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <Building2 className="size-4 text-primary" />
              Storefront Details & Configuration
            </CardTitle>
            <CardDescription className="text-xs">
              Manage your NAP (Name, Address, Phone) information and Google Maps direct review link.
            </CardDescription>
          </div>

          <Button
            size="sm"
            variant={isEditing ? "ghost" : "outline"}
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs rounded-xl h-8 font-semibold"
          >
            {isEditing ? "Cancel Editing" : "Edit Profile Details"}
          </Button>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSaveProfile} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Business Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Store className="size-3.5 text-primary" />
                  Business / Storefront Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  required
                  disabled={!isEditing}
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g. Quick Art Photography"
                  className="text-xs h-9 rounded-xl bg-background"
                />
              </div>

              {/* Primary Category */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Tag className="size-3.5 text-primary" />
                  Primary Business Category
                </Label>
                <Input
                  disabled={!isEditing}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Photography Studio & Color Lab"
                  className="text-xs h-9 rounded-xl bg-background"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Phone className="size-3.5 text-primary" />
                  Primary Phone Number
                </Label>
                <Input
                  disabled={!isEditing}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 99398 00780"
                  className="text-xs h-9 rounded-xl bg-background"
                />
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" />
                  Storefront Address
                </Label>
                <Input
                  disabled={!isEditing}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Main Market, Station Road"
                  className="text-xs h-9 rounded-xl bg-background"
                />
              </div>
            </div>

            {/* Google Review Direct Link */}
            <div className="space-y-1.5 pt-2 border-t border-border/50">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Globe className="size-3.5 text-primary" />
                  Google Maps Review Link / Website URL
                </span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  Used by Magic QR to redirect 5-star customers directly
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  disabled={!isEditing}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://search.google.com/local/writereview?placeid=... or https://g.page/r/.../review"
                  className="text-xs font-mono h-9 rounded-xl bg-background"
                />
                {website && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(website, "_blank")}
                    className="h-9 px-3 rounded-xl shrink-0 text-xs gap-1"
                  >
                    <ExternalLink className="size-3" /> Test Link
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                How to get: Go to Google Maps or Google Business Profile ➡️ Click "Ask for reviews" ➡️ Copy the short link.
              </p>
            </div>

            {/* Save Button (when editing) */}
            {isEditing && (
              <div className="pt-2 flex justify-end gap-2 animate-in fade-in">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  className="text-xs rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  size="sm"
                  className="text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-white gap-1.5 px-5 h-9"
                >
                  <Save className="size-3.5" />
                  {isSaving ? "Saving..." : "Save Business Profile"}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Select Business Profile Modal */}
      <GmbSelectProfileModal
        open={isSelectModalOpen}
        onOpenChange={setIsSelectModalOpen}
        activeLocationId={location?.id}
        onProfileSelected={(newLoc) => {
          setLocation(newLoc as any);
          setStoreName(newLoc.location_name || "");
          setCategory(newLoc.primary_category || "Local Business");
          setPhone(newLoc.phone || "");
          setAddress(newLoc.address || "");
          setWebsite(newLoc.website || "");
          loadConfig();
        }}
      />
    </div>
  );
}
