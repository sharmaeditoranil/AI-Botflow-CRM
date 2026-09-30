"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Store,
  MapPin,
  CheckCircle2,
  Building2,
  RefreshCw,
  Search,
  Radio,
  Tag,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface GmbProfileLocation {
  id: string;
  location_id: string;
  location_name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  primary_category: string | null;
  is_verified?: boolean;
  metadata?: Record<string, any>;
}

interface GmbSelectProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeLocationId?: string | null;
  onProfileSelected?: (selectedLocation: GmbProfileLocation) => void;
}

export function GmbSelectProfileModal({
  open,
  onOpenChange,
  activeLocationId,
  onProfileSelected,
}: GmbSelectProfileModalProps) {
  const [locations, setLocations] = useState<GmbProfileLocation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(activeLocationId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  const fetchProfiles = async (refreshFromGoogle = false) => {
    try {
      if (refreshFromGoogle) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // Fetch config to get email & initial state
      const configRes = await fetch("/api/gmb/config");
      const configData = await configRes.json();
      if (configData?.account?.email) {
        setGoogleEmail(configData.account.email);
      }

      // Fetch locations list
      const url = refreshFromGoogle ? "/api/gmb/locations?refresh=true" : "/api/gmb/locations";
      const res = await fetch(url);
      const data = await res.json();

      if (data?.locations) {
        setLocations(data.locations);

        // Determine pre-selected id
        const active = data.locations.find((l: GmbProfileLocation) => l.metadata?.is_active === true);
        if (active) {
          setSelectedId(active.id);
        } else if (activeLocationId) {
          setSelectedId(activeLocationId);
        } else if (data.locations.length === 1) {
          setSelectedId(data.locations[0].id);
        }
      }

      if (refreshFromGoogle) {
        toast.success("Refreshed business profiles directly from Google!");
      }
    } catch (err: any) {
      console.error("Failed to load GMB locations:", err);
      toast.error("Failed to fetch Google Business Profiles");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchProfiles(false);
    }
  }, [open]);

  useEffect(() => {
    if (activeLocationId) {
      setSelectedId(activeLocationId);
    }
  }, [activeLocationId]);

  const handleConfirmSelection = async () => {
    if (!selectedId) {
      toast.error("Please select a Google Business Profile first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/gmb/locations/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: selectedId }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const chosen = locations.find((l) => l.id === selectedId) || data.location;
        toast.success(`Connected "${chosen?.location_name || "Profile"}" successfully!`);
        onOpenChange(false);
        if (onProfileSelected && chosen) {
          onProfileSelected(chosen);
        }
      } else {
        toast.error(data.error || "Failed to select business profile");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredLocations = locations.filter((loc) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      loc.location_name?.toLowerCase().includes(q) ||
      loc.address?.toLowerCase().includes(q) ||
      loc.primary_category?.toLowerCase().includes(q) ||
      loc.location_id?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-border/80 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b border-border/60 bg-gradient-to-br from-card via-card to-amber-500/5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
              <Store className="size-3" /> Step 2: Profile Selection
            </span>
            {googleEmail && (
              <span className="text-[11px] text-muted-foreground truncate max-w-xs">
                • {googleEmail}
              </span>
            )}
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            Select Business Profile
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Multiple Google Business listings found under your Google Account. Select the <strong>single business profile</strong> you want to manage with AiBotFlow.
          </DialogDescription>

          {/* Search bar + Refresh */}
          <div className="flex items-center gap-2 mt-4 pt-1">
            <div className="relative flex-1">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by business name, city, or ID..."
                className="pl-8 text-xs h-9 rounded-xl bg-background/80"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchProfiles(true)}
              disabled={isRefreshing || isLoading}
              className="text-xs font-semibold h-9 rounded-xl px-3 shrink-0 gap-1.5 border-border"
              title="Refresh list directly from Google API"
            >
              <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin text-amber-500")} />
              <span className="hidden sm:inline">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Profile List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 min-h-[220px] max-h-[380px]">
          {isLoading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="size-6 text-amber-500 animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">Fetching your Google Business listings...</p>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="py-10 text-center space-y-3 bg-muted/20 rounded-2xl border border-dashed border-border/80 p-6">
              <AlertCircle className="size-8 text-amber-500 mx-auto opacity-70" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">No Google Business Profiles Found</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {searchQuery
                    ? `No profile matching "${searchQuery}". Try clearing search.`
                    : "No verified business locations were returned for this Google account. Click 'Refresh' to re-query Google."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchProfiles(true)}
                disabled={isRefreshing}
                className="text-xs rounded-xl"
              >
                <RefreshCw className="size-3 mr-1.5" /> Re-fetch from Google
              </Button>
            </div>
          ) : (
            filteredLocations.map((loc) => {
              const isSelected = selectedId === loc.id;
              const isCurrentlyActive = loc.metadata?.is_active === true;
              const formattedLocId = loc.location_id.startsWith("locations/")
                ? loc.location_id
                : `locations/${loc.location_id}`;

              return (
                <div
                  key={loc.id}
                  onClick={() => setSelectedId(loc.id)}
                  className={cn(
                    "relative flex items-start gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer text-left select-none",
                    isSelected
                      ? "bg-amber-500/[0.07] border-amber-500 shadow-md shadow-amber-500/10 ring-1 ring-amber-500"
                      : "bg-card/60 hover:bg-card/90 border-border/80 hover:border-foreground/20"
                  )}
                >
                  {/* Radio / Selection Indicator */}
                  <div className="pt-0.5 shrink-0">
                    <div
                      className={cn(
                        "size-5 rounded-full border flex items-center justify-center transition-all",
                        isSelected
                          ? "border-amber-500 bg-amber-500 text-slate-950 shadow-xs"
                          : "border-muted-foreground/40 bg-background"
                      )}
                    >
                      {isSelected && <span className="size-2 rounded-full bg-slate-950" />}
                    </div>
                  </div>

                  {/* Profile Details */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <h4 className="text-sm font-bold tracking-tight text-foreground truncate max-w-md">
                        {loc.location_name}
                      </h4>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCurrentlyActive && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold py-0"
                          >
                            Currently Active
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-semibold flex items-center gap-1 py-0"
                        >
                          <ShieldCheck className="size-3 text-emerald-500" /> Google Verified
                        </Badge>
                      </div>
                    </div>

                    {/* Address / City */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5 text-amber-500 shrink-0" />
                      <span className="truncate">
                        {loc.address || "Address details registered on Google Maps"}
                      </span>
                    </div>

                    {/* Meta Row: Primary Category & Location ID */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                      {loc.primary_category && (
                        <span className="inline-flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded-md border border-border/50 text-[10px] font-medium text-foreground">
                          <Tag className="size-2.5 text-primary" />
                          {loc.primary_category}
                        </span>
                      )}

                      <span className="font-mono text-[10px] bg-muted/40 px-2 py-0.5 rounded-md border border-border/40 text-muted-foreground">
                        ID: {formattedLocId}
                      </span>

                      {loc.phone && (
                        <span className="text-[10px] text-muted-foreground">
                          📞 {loc.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 sm:p-5 border-t border-border/60 bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground">
            {locations.length > 0 && (
              <span>
                <strong>{locations.length}</strong> Google Business {locations.length === 1 ? "profile" : "profiles"} available
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs rounded-xl h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!selectedId || isSubmitting}
              onClick={handleConfirmSelection}
              className="text-xs font-bold rounded-xl h-9 px-5 bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20 gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <span>Connect Selected Profile</span>
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
