"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  QrCode,
  Download,
  Copy,
  ExternalLink,
  ShieldCheck,
  Star,
  Sparkles,
  TrendingUp,
  Eye,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Settings,
  Share2,
  Phone,
  RefreshCw,
  Clock,
  User,
} from "lucide-react";

interface MagicQrConfig {
  id?: string;
  business_name: string;
  slug: string;
  google_review_url: string;
  place_id: string;
  min_star_for_google: number;
  whatsapp_alert_number: string;
  heading: string;
  subheading: string;
  thank_you_title: string;
  thank_you_message: string;
  qr_scans_count?: number;
  positive_redirects_count?: number;
  negative_feedbacks_count?: number;
}

interface PrivateFeedback {
  id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  star_rating: number;
  feedback_text: string;
  status: "new" | "in_progress" | "resolved";
  created_at: string;
}

export function GmbMagicQr() {
  const [config, setConfig] = useState<MagicQrConfig | null>(null);
  const [feedbacks, setFeedbacks] = useState<PrivateFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [bizName, setBizName] = useState("");
  const [slug, setSlug] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [minStar, setMinStar] = useState(4);
  const [heading, setHeading] = useState("");
  const [subheading, setSubheading] = useState("");
  const [activeTab, setActiveTab] = useState<"qr" | "feedbacks" | "settings">("qr");

  const [siteOrigin, setSiteOrigin] = useState("https://dash.aibotflow.in");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteOrigin(window.location.origin);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/gmb/magic-qr");
      const data = await res.json();
      if (res.ok && data.config) {
        setConfig(data.config);
        setBizName(data.config.business_name || "");
        setSlug(data.config.slug || "");
        setGoogleReviewUrl(data.config.google_review_url || "");
        setMinStar(data.config.min_star_for_google || 4);
        setHeading(data.config.heading || "How was your experience with us?");
        setSubheading(data.config.subheading || "Your feedback helps us continuously improve.");
        setFeedbacks(data.feedbacks || []);
      }
    } catch (err: any) {
      toast.error("Failed to load Magic QR configuration");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const publicReviewUrl = `${siteOrigin}/review/${slug || "my-biz"}`;
  const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(publicReviewUrl)}&margin=15&color=111827`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicReviewUrl);
    toast.success("Magic Review URL copied to clipboard!");
  };

  const handleDownloadQr = async () => {
    try {
      const response = await fetch(qrCodeApiUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `magic-qr-${slug || "google-review"}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("QR Code downloaded successfully!");
    } catch {
      toast.error("Could not download QR code directly. Please right click on the image to save.");
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizName.trim() || !slug.trim()) {
      toast.error("Business name and URL slug are required");
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch("/api/gmb/magic-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: bizName.trim(),
          slug: slug.trim(),
          google_review_url: googleReviewUrl.trim(),
          min_star_for_google: Number(minStar),
          heading,
          subheading,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Magic QR configuration saved!");
        await loadData();
      } else {
        toast.error(data.error || "Failed to save configuration");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolveFeedback = async (feedbackId: string) => {
    try {
      const res = await fetch("/api/gmb/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, status: "resolved" }),
      });
      if (res.ok) {
        setFeedbacks((prev) =>
          prev.map((f) => (f.id === feedbackId ? { ...f, status: "resolved" } : f))
        );
        toast.success("Feedback marked as resolved!");
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="size-6 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Loading Magic QR suite...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feature Intro Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider">
              <ShieldCheck className="size-3" /> Smart Review Funnel (Magic QR)
            </div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              Filter Negative Reviews & 10x 5-Star Google Reviews
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              When customers scan this QR: Happy customers (4-5 Stars) are instantly redirected to your{" "}
              <strong>Google Maps Review page</strong>. Unhappy customers (1-3 Stars) are intercepted into a{" "}
              <strong>private internal feedback form</strong>, preventing public negative reviews on Google!
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(publicReviewUrl, "_blank")}
              className="text-xs gap-1.5 border-amber-500/30 text-foreground"
            >
              <Eye className="size-3.5" /> Test Public Page
            </Button>
            <Button
              size="sm"
              onClick={handleCopyLink}
              className="text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            >
              <Copy className="size-3.5" /> Copy Link
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-amber-500/15">
          <div className="bg-card/60 backdrop-blur-xs p-3 rounded-xl border border-border/50">
            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <QrCode className="size-3.5 text-primary" /> Total Scans
            </p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {config?.qr_scans_count || 0}
            </p>
          </div>

          <div className="bg-card/60 backdrop-blur-xs p-3 rounded-xl border border-border/50">
            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Star className="size-3.5 text-amber-500 fill-amber-500" /> 5-Star Redirects
            </p>
            <p className="text-xl font-bold text-amber-500 mt-0.5">
              {Math.max(0, (config?.qr_scans_count || 0) - feedbacks.length)}
            </p>
          </div>

          <div className="bg-card/60 backdrop-blur-xs p-3 rounded-xl border border-border/50">
            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-emerald-500" /> Negative Reviews Filtered
            </p>
            <p className="text-xl font-bold text-emerald-500 mt-0.5">
              {feedbacks.length}
            </p>
          </div>

          <div className="bg-card/60 backdrop-blur-xs p-3 rounded-xl border border-border/50">
            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <TrendingUp className="size-3.5 text-primary" /> Google Protection Rate
            </p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              {config?.qr_scans_count && config.qr_scans_count > 0
                ? `${Math.round(((config.qr_scans_count - feedbacks.length) / config.qr_scans_count) * 100)}%`
                : "100%"}
            </p>
          </div>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <Button
          size="sm"
          variant={activeTab === "qr" ? "default" : "ghost"}
          onClick={() => setActiveTab("qr")}
          className="text-xs gap-1.5 h-8 font-semibold"
        >
          <QrCode className="size-3.5" /> Standee & QR Code
        </Button>
        <Button
          size="sm"
          variant={activeTab === "feedbacks" ? "default" : "ghost"}
          onClick={() => setActiveTab("feedbacks")}
          className="text-xs gap-1.5 h-8 font-semibold relative"
        >
          <MessageSquare className="size-3.5" />
          Private Feedback Inbox
          {feedbacks.some((f) => f.status === "new") && (
            <span className="size-2 rounded-full bg-rose-500 ml-1 animate-pulse" />
          )}
        </Button>
        <Button
          size="sm"
          variant={activeTab === "settings" ? "default" : "ghost"}
          onClick={() => setActiveTab("settings")}
          className="text-xs gap-1.5 h-8 font-semibold"
        >
          <Settings className="size-3.5" /> Funnel Settings
        </Button>
      </div>

      {/* TAB 1: QR Code & Printable Standee */}
      {activeTab === "qr" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: QR Card */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="border-border/70 shadow-sm overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Your Magic QR Code</span>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    Active & Tracking
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Place this QR on billing counters, receipts, table tents, or packaging.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex flex-col items-center">
                {/* QR Display Frame */}
                <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-200 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeApiUrl}
                    alt="Magic Review QR Code"
                    className="size-52 sm:size-60 object-contain rounded-lg mx-auto"
                  />
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-center gap-1 text-[11px] font-bold text-slate-800">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    <span>Scan to Review Us on Google</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 w-full">
                  <Button
                    onClick={handleDownloadQr}
                    className="flex-1 text-xs gap-1.5 font-semibold h-9"
                  >
                    <Download className="size-3.5" /> Download QR (PNG)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.print()}
                    className="text-xs gap-1.5 h-9"
                  >
                    <Printer className="size-3.5" /> Print
                  </Button>
                </div>

                {/* Direct Link Share */}
                <div className="w-full space-y-1.5 pt-2 border-t border-border/60">
                  <Label className="text-[11px] text-muted-foreground font-semibold">
                    Public Review Landing URL
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      readOnly
                      value={publicReviewUrl}
                      className="text-xs font-mono bg-muted/40 h-8"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyLink}
                      className="h-8 px-2.5 shrink-0"
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Printable Standee / Table Tent Preview */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="border-border/70 shadow-sm bg-gradient-to-b from-card to-muted/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Printer className="size-4 text-primary" />
                  Printable Table Standee / Desk Display
                </CardTitle>
                <CardDescription className="text-xs">
                  Ready-to-print preview for your reception desk, restaurant tables, or showroom.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Printable Standee Mockup */}
                <div className="max-w-md mx-auto bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border-4 border-slate-900 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-rose-500 to-primary" />

                  {/* Header */}
                  <div className="mb-4">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                      Customer Experience
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                      {bizName || "Our Business"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Loved your experience with us?
                    </p>
                  </div>

                  {/* QR */}
                  <div className="inline-block p-3 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 my-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCodeApiUrl}
                      alt="Review QR"
                      className="size-44 sm:size-48 object-contain mx-auto"
                    />
                  </div>

                  {/* Rating Stars Graphic */}
                  <div className="flex items-center justify-center gap-1.5 my-3">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="size-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>

                  {/* CTA Text */}
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-extrabold text-slate-900">
                      Scan with your phone camera to review!
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Takes only 5 seconds • Google Maps Verified
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: Private Feedback Inbox */}
      {activeTab === "feedbacks" && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-500" />
                Filtered Negative Feedbacks ({feedbacks.length})
              </span>
              <Badge variant="outline" className="text-xs bg-muted">
                Private to CRM • Never on Google
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              These are customers who rated 1 to 3 stars. Instead of publicly harming your Google Maps score, their complaints were intercepted here so you can reach out and resolve them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feedbacks.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">No negative feedback recorded!</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  All customer scans so far have been 4 or 5 stars and redirected directly to Google Maps!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {feedbacks.map((fb) => (
                  <div
                    key={fb.id}
                    className="p-4 rounded-xl border border-border/70 bg-card hover:bg-muted/30 transition-colors space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold text-xs">
                          {fb.customer_name?.[0]?.toUpperCase() || <User className="size-3.5" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">
                            {fb.customer_name || "Anonymous Customer"}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5 text-amber-500 font-semibold">
                              <Star className="size-3 fill-amber-500" /> {fb.star_rating} Stars
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="size-2.5" />
                              {new Date(fb.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {fb.customer_phone && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`tel:${fb.customer_phone}`, "_blank")}
                            className="text-xs h-7 gap-1"
                          >
                            <Phone className="size-3 text-primary" /> Call Back ({fb.customer_phone})
                          </Button>
                        )}
                        {fb.status === "new" ? (
                          <Button
                            size="sm"
                            onClick={() => handleResolveFeedback(fb.id)}
                            className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                          >
                            <CheckCircle2 className="size-3" /> Mark Resolved
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            Resolved
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="bg-muted/40 p-3 rounded-lg text-xs text-foreground/90 border border-border/50">
                      <p className="font-semibold text-[11px] text-rose-600 dark:text-rose-400 mb-1">
                        Customer Concern / Feedback:
                      </p>
                      "{fb.feedback_text}"
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Funnel Settings */}
      {activeTab === "settings" && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Settings className="size-4 text-primary" />
              Magic QR & Funnel Configuration
            </CardTitle>
            <CardDescription className="text-xs">
              Customize your Google Maps review link, minimum star threshold, and page headings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveConfig} className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Business Name Displayed</Label>
                  <Input
                    required
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="e.g. Quick Art Photography"
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Custom URL Slug</Label>
                  <Input
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="e.g. quick-art"
                    className="text-xs font-mono h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>Google Maps Review Direct Link (URL)</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Where 4 & 5 star customers will be redirected
                  </span>
                </Label>
                <Input
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="e.g. https://search.google.com/local/writereview?placeid=ChIJ... or https://g.page/r/.../review"
                  className="text-xs font-mono h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Tip: Get your review link directly from Google Business Profile Manager ("Ask for reviews" button).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Minimum Star Rating for Google Redirect
                </Label>
                <div className="flex items-center gap-3">
                  {[4, 5].map((stars) => (
                    <label
                      key={stars}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        minStar === stars
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="minStar"
                        checked={minStar === stars}
                        onChange={() => setMinStar(stars)}
                        className="sr-only"
                      />
                      <Star className="size-3.5 fill-amber-400 text-amber-400" />
                      <span>{stars} Stars and above ({stars === 4 ? "Recommended: 4 & 5" : "Only 5 Stars"})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Page Heading</Label>
                  <Input
                    value={heading}
                    onChange={(e) => setHeading(e.target.value)}
                    placeholder="How was your experience today?"
                    className="text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Page Subheading</Label>
                  <Input
                    value={subheading}
                    onChange={(e) => setSubheading(e.target.value)}
                    placeholder="Tap a star to share your feedback"
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="text-xs font-semibold h-9 px-6 bg-primary hover:bg-primary/90 text-white"
                >
                  {isSaving ? "Saving..." : "Save Magic QR Settings"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
