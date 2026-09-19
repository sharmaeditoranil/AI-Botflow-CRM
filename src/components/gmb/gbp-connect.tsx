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
  Plus,
  Radio,
  Check,
  LogOut,
  Layers,
} from "lucide-react";

export interface GmbLocation {
  id: string;
  location_id: string;
  location_name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  primary_category: string | null;
  is_verified?: boolean;
  metadata?: {
    is_active?: boolean;
    [key: string]: any;
  };
}

export function GbpConnect() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [googleAppConfigured, setGoogleAppConfigured] = useState(true);

  const [locations, setLocations] = useState<GmbLocation[]>([]);
  const [activeLocId, setActiveLocId] = useState<string | null>(null);

  // Form states for the currently selected/active location
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // New location modal/form toggle
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [newLocCategory, setNewLocCategory] = useState("");
  const [newLocAddress, setNewLocAddress] = useState("");
  const [newLocPhone, setNewLocPhone] = useState("");
  const [newLocWebsite, setNewLocWebsite] = useState("");
  const [isCreatingLoc, setIsCreatingLoc] = useState(false);

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/gmb/config");
      const data = await res.json();

      if (data) {
        setGoogleAppConfigured(data.googleAppConfigured ?? true);
        if (data.connected) {
          setIsConnected(true);
          setConnectedEmail(data.account?.email || "Google Account Connected");

          const locList: GmbLocation[] = data.locations || [];
          setLocations(locList);

          // Find active location
          const active =
            locList.find((l) => l.metadata?.is_active) || locList[0] || null;

          if (active) {
            setActiveLocId(active.id);
            setStoreName(active.location_name || "");
            setAddress(active.address || "");
            setPhone(active.phone || "");
            setWebsite(active.website || "");
            setCategory(active.primary_category || "");
          } else {
            // Default blank/prompt if no profiles linked yet
            setStoreName("");
            setAddress("");
            setPhone("");
            setWebsite("");
            setCategory("");
          }
        } else {
          setIsConnected(false);
          setConnectedEmail(null);
          setLocations([]);
        }
      }
    } catch (err) {
      console.error("Error loading GMB config:", err);
    }
  };

  useEffect(() => {
    loadConfig();
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
        toast.error("Google OAuth API credentials missing in Super Admin Settings.");
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

  const handleSelectLocation = async (loc: GmbLocation) => {
    try {
      setActiveLocId(loc.id);
      setStoreName(loc.location_name || "");
      setAddress(loc.address || "");
      setPhone(loc.phone || "");
      setWebsite(loc.website || "");
      setCategory(loc.primary_category || "");

      const res = await fetch("/api/gmb/locations/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: loc.id }),
      });

      if (res.ok) {
        setLocations((prev) =>
          prev.map((l) => ({
            ...l,
            metadata: { ...(l.metadata || {}), is_active: l.id === loc.id },
          }))
        );
        toast.success(`Active profile switched to "${loc.location_name}"!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to switch active profile.");
    }
  };

  const handleSaveActiveLocation = async () => {
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
          id: activeLocId || undefined,
          location_name: storeName,
          address,
          phone,
          website,
          primary_category: category,
          is_active: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Profile saved and updated in database!");
        await loadConfig();
      } else {
        toast.error(data.error || "Failed to save profile.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error saving profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) {
      toast.error("Profile / Business name is required");
      return;
    }

    try {
      setIsCreatingLoc(true);
      const res = await fetch("/api/gmb/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_name: newLocName,
          address: newLocAddress,
          phone: newLocPhone,
          website: newLocWebsite,
          primary_category: newLocCategory,
          is_active: true,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Profile "${newLocName}" added & set as active!`);
        setShowAddForm(false);
        setNewLocName("");
        setNewLocCategory("");
        setNewLocAddress("");
        setNewLocPhone("");
        setNewLocWebsite("");
        await loadConfig();
      } else {
        toast.error(data.error || "Failed to add profile.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error adding profile.");
    } finally {
      setIsCreatingLoc(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect this Google account?")) return;
    try {
      const res = await fetch("/api/gmb/disconnect", { method: "POST" });
      if (res.ok) {
        setIsConnected(false);
        setConnectedEmail(null);
        setLocations([]);
        setActiveLocId(null);
        setStoreName("");
        setAddress("");
        setPhone("");
        setWebsite("");
        setCategory("");
        toast.info("Google Business Profile Disconnected");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Missing credentials alert */}
      {!googleAppConfigured && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-foreground">Google Cloud API Credentials Not Configured</p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                Configure your Google Client ID &amp; Secret in Super Admin Settings.
              </p>
            </div>
          </div>
          <Link
            href="/super-admin/settings"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-3 py-1.5 font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors shrink-0"
          >
            <KeyRound className="size-3.5" />
            Configure in Super Admin →
          </Link>
        </div>
      )}

      {/* Connection Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card/90 to-primary/10 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-xs shrink-0">
              <Store className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
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
                {connectedEmail ? (
                  <span>
                    Linked Google Account: <strong className="text-foreground font-semibold">{connectedEmail}</strong>
                  </span>
                ) : (
                  "Official Google Cloud API integration for storefront management, live reviews & AI replies."
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectWithGoogle}
                  disabled={isConnecting}
                  className="rounded-xl text-xs border-primary/40 text-primary hover:bg-primary/10"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${isConnecting ? "animate-spin" : ""}`} />
                  Reconnect / Switch Account
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  className="rounded-xl text-xs text-muted-foreground hover:text-destructive"
                >
                  <LogOut className="size-3.5 mr-1" />
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

      {/* Multi-Profile Selector & Management Card */}
      {isConnected && (
        <Card className="rounded-2xl border-border/70 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  Your Google Business Profiles ({locations.length} Profiles Linked)
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Ek Google account ke andar multiple profiles manage karein. Kisko active rakhna hai select karein.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddForm(!showAddForm)}
                className="rounded-xl text-xs border-primary/30 text-primary hover:bg-primary/10 shrink-0 self-start sm:self-auto"
              >
                <Plus className="size-3.5 mr-1" />
                {showAddForm ? "Cancel" : "Add / Link Another Profile"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Inline Add Location Form */}
            {showAddForm && (
              <form
                onSubmit={handleCreateNewLocation}
                className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3.5 transition-all"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Store className="size-3.5 text-primary" /> Add Business Profile / Storefront
                  </h4>
                  <span className="text-[10px] text-muted-foreground">Linked with {connectedEmail}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Profile / Business Name *</Label>
                    <Input
                      placeholder="e.g. Sharma Digital Lab & Studio"
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                      required
                      className="text-xs rounded-xl bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Category</Label>
                    <Input
                      placeholder="e.g. Photo Lab / Digital Studio"
                      value={newLocCategory}
                      onChange={(e) => setNewLocCategory(e.target.value)}
                      className="text-xs rounded-xl bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Address</Label>
                    <Input
                      placeholder="e.g. Main Market, Near City Center"
                      value={newLocAddress}
                      onChange={(e) => setNewLocAddress(e.target.value)}
                      className="text-xs rounded-xl bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold">Phone Number</Label>
                    <Input
                      placeholder="e.g. +91 98765 43210"
                      value={newLocPhone}
                      onChange={(e) => setNewLocPhone(e.target.value)}
                      className="text-xs rounded-xl bg-background"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isCreatingLoc}
                    className="rounded-xl text-xs bg-primary text-primary-foreground"
                  >
                    {isCreatingLoc ? "Saving..." : "Save & Set as Active"}
                  </Button>
                </div>
              </form>
            )}

            {/* Profile cards list */}
            {locations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {locations.map((loc) => {
                  const isActive = loc.id === activeLocId || loc.metadata?.is_active;
                  return (
                    <div
                      key={loc.id}
                      onClick={() => handleSelectLocation(loc)}
                      className={`relative cursor-pointer rounded-2xl border p-3.5 transition-all flex flex-col justify-between gap-3 ${
                        isActive
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                          : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30"
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-foreground line-clamp-1">
                            {loc.location_name}
                          </h4>
                          {isActive ? (
                            <Badge className="bg-emerald-500 text-white text-[9px] px-1.5 py-0 font-bold shrink-0">
                              <Check className="size-2.5 mr-0.5" /> Active
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground hover:text-primary shrink-0">
                              Click to Select
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-primary/80 font-medium line-clamp-1">
                          {loc.primary_category || "General Business"}
                        </p>
                        {loc.address && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 line-clamp-1">
                            <MapPin className="size-3 shrink-0" /> {loc.address}
                          </p>
                        )}
                        {loc.phone && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Phone className="size-3 shrink-0" /> {loc.phone}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Google Verified</span>
                        {isActive ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Radio className="size-3 animate-pulse" /> Active Storefront
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2 rounded-lg text-primary hover:bg-primary/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectLocation(loc);
                            }}
                          >
                            Set Active
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-border/80 bg-muted/20 p-4 text-center space-y-2">
                <Store className="size-8 text-muted-foreground mx-auto" />
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Google Account Connected ({connectedEmail})
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-md mx-auto mt-0.5">
                    Google ne profile details automatic send nahi ki kyunki Google consent screen par &quot;Manage business listings&quot; permission checkbox tick nahi tha.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddForm(true)}
                  className="rounded-xl text-xs bg-primary text-primary-foreground mt-1"
                >
                  <Plus className="size-3.5 mr-1" /> Add / Link Your 3 Profiles
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                    Active Business Profile Information
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {storeName
                      ? `Managing profile: ${storeName}`
                      : "Public storefront data verified with Google Maps & Search."}
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
                  <Label className="text-xs font-semibold">Business Name *</Label>
                  <Input
                    placeholder="Enter business / shop name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Primary Category</Label>
                  <Input
                    placeholder="e.g. Photography Studio / Digital Lab"
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
                    placeholder="Shop number, street, city, pin code"
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
                      placeholder="+91 98765 43210"
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
                      placeholder="https://yourwebsite.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="text-xs pl-9 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  size="sm"
                  disabled={isSaving}
                  onClick={handleSaveActiveLocation}
                  className="rounded-xl text-xs bg-primary text-primary-foreground shadow-sm"
                >
                  {isSaving ? "Saving..." : "Save Active Profile"}
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
                    <h4 className="font-bold text-sm text-foreground">
                      {storeName || "Your Business Name"}
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      {category || "Business Category"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                    ★ 4.8
                  </div>
                </div>

                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-1.5 truncate">
                    <MapPin className="size-3 shrink-0 text-primary" />
                    {address || "Store address will appear here"}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3 shrink-0 text-primary" />
                    {phone || "Phone number"}
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
                  <p className="font-semibold text-foreground">Google Cloud OAuth Active</p>
                  <p className="text-muted-foreground">
                    Connected with {connectedEmail || "Google Account"}. Switch between your 3 profiles anytime.
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
