"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Star,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  Send,
  Wand2,
  ThumbsUp,
  Filter,
  Bot,
  Flame,
  ArrowRight,
  RefreshCw,
  Store,
  ExternalLink,
  Building2,
  Plus,
  X,
  Trash2,
  Copy,
} from "lucide-react";

interface ReviewItem {
  id: string;
  google_review_id?: string;
  location_id?: string;
  name: string;
  rating: number;
  date: string;
  comment: string;
  sentiment: "positive" | "neutral" | "negative";
  replied: boolean;
  replyText?: string;
}

export function GmbReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [activeLocationName, setActiveLocationName] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [activeLocationWebsite, setActiveLocationWebsite] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | "all">("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"all" | "unreplied" | "replied">("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [activeReplyTexts, setActiveReplyTexts] = useState<Record<string, string>>({});
  const [tone, setTone] = useState<"friendly" | "professional" | "grateful">("friendly");
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);

  // Manual Review Form
  const [showAddReview, setShowAddReview] = useState(false);
  const [newRevName, setNewRevName] = useState("");
  const [newRevRating, setNewRevRating] = useState("5");
  const [newRevComment, setNewRevComment] = useState("");
  const [isAddingRev, setIsAddingRev] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const cfgRes = await fetch("/api/gmb/config");
      const cfg = await cfgRes.json();
      if (cfg?.locations && cfg.locations.length > 0) {
        const active = cfg.locations.find((l: any) => l.metadata?.is_active) || cfg.locations[0];
        if (active) {
          setActiveLocationName(active.location_name);
          setActiveLocationId(active.id || null);
          setActiveLocationWebsite(active.website || null);
        }
      }

      const revRes = await fetch("/api/gmb/reviews");
      const revData = await revRes.json();
      if (revData?.reviews && revData.reviews.length > 0) {
        const mapped: ReviewItem[] = revData.reviews.map((r: any) => ({
          id: r.id || r.google_review_id || r.review_id,
          google_review_id: r.google_review_id,
          location_id: r.location_id,
          name: r.reviewer_name || "Google User",
          rating: r.star_rating || 5,
          date: r.review_timestamp ? new Date(r.review_timestamp).toLocaleDateString() : "Recently",
          comment: r.comment || "",
          sentiment: r.sentiment || (r.star_rating >= 4 ? "positive" : r.star_rating === 3 ? "neutral" : "negative"),
          replied: r.is_replied ?? !!(r.reply_text || r.review_reply),
          replyText: r.reply_text || r.review_reply || undefined,
        }));
        setReviews(mapped);
      } else {
        setReviews([]);
      }
    } catch (err) {
      console.error("Error loading reviews:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncReviews = async () => {
    try {
      setIsSyncing(true);
      const res = await fetch("/api/gmb/sync", { method: "POST" });
      const data = await res.json();
      if (data.pendingApproval) {
        toast.info(data.message || "Google Business API application is under Google review.", {
          duration: 6000,
        });
      } else if (data.success) {
        toast.success(data.message || "Synced reviews from Google!");
        await loadData();
      } else {
        toast.error(data.error || "Failed to sync reviews.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error syncing reviews.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter reviews
  const filteredReviews = reviews.filter((rev) => {
    if (selectedRatingFilter !== "all" && rev.rating !== selectedRatingFilter) return false;
    if (selectedStatusFilter === "unreplied" && rev.replied) return false;
    if (selectedStatusFilter === "replied" && !rev.replied) return false;
    return true;
  });

  const generateAiReply = async (review: ReviewItem) => {
    setGeneratingId(review.id);
    try {
      const res = await fetch("/api/gmb/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerName: review.name,
          rating: review.rating,
          reviewText: review.comment,
          tone,
        }),
      });

      const data = await res.json();
      if (res.ok && data.reply) {
        setActiveReplyTexts((prev) => ({ ...prev, [review.id]: data.reply }));
        toast.success(`AI generated reply using ${data.model || "AI"}!`);
      } else {
        toast.error(data.error || "Failed to generate reply.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error reaching AI API.");
    } finally {
      setGeneratingId(null);
    }
  };

  const handlePostReply = async (id: string) => {
    const text = activeReplyTexts[id];
    if (!text?.trim()) {
      toast.error("Reply text cannot be empty");
      return;
    }

    const review = reviews.find((r) => r.id === id);

    try {
      const res = await fetch("/api/gmb/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: id,
          googleReviewId: review?.google_review_id,
          locationId: review?.location_id || activeLocationId,
          replyText: text.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, replied: true, replyText: text.trim() } : r
          )
        );
        if (data.postedToGoogle) {
          toast.success("Reply published live on Google Maps via Google API!");
        } else {
          toast.success("Reply saved in CRM! You can also paste it on Google Maps.");
        }
      } else {
        toast.error(data.error || "Failed to post reply.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error posting reply.");
    }
  };

  const [isClearingDummy, setIsClearingDummy] = useState(false);
  const handleClearDummyReviews = async () => {
    if (!confirm("Are you sure you want to delete all test/dummy reviews?")) return;
    try {
      setIsClearingDummy(true);
      const res = await fetch("/api/gmb/reviews?clearDummy=true", { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Cleared all dummy seed reviews!");
        await loadData();
      } else {
        toast.error(data.error || "Failed to clear dummy reviews");
      }
    } catch (err: any) {
      toast.error(err.message || "Error clearing dummy reviews");
    } finally {
      setIsClearingDummy(false);
    }
  };

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRevName.trim() || !newRevComment.trim()) {
      toast.error("Please enter reviewer name and comment");
      return;
    }

    try {
      setIsAddingRev(true);
      const res = await fetch("/api/gmb/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewer_name: newRevName.trim(),
          star_rating: Number(newRevRating),
          comment: newRevComment.trim(),
          location_id: activeLocationId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Review from "${newRevName.trim()}" added successfully!`);
        setNewRevName("");
        setNewRevComment("");
        setShowAddReview(false);
        await loadData();
      } else {
        toast.error(data.error || "Failed to add review");
      }
    } catch (err: any) {
      toast.error(err.message || "Error saving review");
    } finally {
      setIsAddingRev(false);
    }
  };

  const unrepliedCount = reviews.filter((r) => !r.replied).length;

  return (
    <div className="space-y-4">
      {/* Unified Clean Action Bar: Filters + Sync + Add + AI Settings */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-card/80 p-3 sm:p-4 rounded-2xl border border-border/80 shadow-xs backdrop-blur-sm">
        {/* Left: Star & Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => {
              setSelectedRatingFilter("all");
              setSelectedStatusFilter("all");
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              selectedRatingFilter === "all" && selectedStatusFilter === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            All Reviews ({reviews.length})
          </button>

          <button
            type="button"
            onClick={() =>
              setSelectedStatusFilter(selectedStatusFilter === "unreplied" ? "all" : "unreplied")
            }
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedStatusFilter === "unreplied"
                ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span>Unreplied</span>
            <span className="text-[10px] bg-background/50 px-1.5 py-0.2 rounded-full">
              {unrepliedCount}
            </span>
          </button>

          {[5, 4, 3, 2].map((stars) => (
            <button
              key={stars}
              type="button"
              onClick={() =>
                setSelectedRatingFilter(selectedRatingFilter === stars ? "all" : stars)
              }
              className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
                selectedRatingFilter === stars
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {stars} ★
            </button>
          ))}
        </div>

        {/* Right: Actions Bar (Sync, Add Review, AI Reply Settings) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* AI Reply Settings Control */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-2.5 py-1 border border-border/70">
            <Sparkles className="size-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] font-semibold text-muted-foreground">Tone:</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as any)}
              className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden cursor-pointer"
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="grateful">Grateful</option>
            </select>

            <span className="text-border mx-0.5">|</span>

            <button
              type="button"
              onClick={() => {
                setAutoReplyEnabled(!autoReplyEnabled);
                toast.info(
                  autoReplyEnabled
                    ? "5★ Auto-Reply Bot disabled"
                    : "5★ Auto-Reply Bot enabled (auto-drafts in 60s)"
                );
              }}
              className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer"
              title="Toggle automatic AI replies for 5-star reviews"
            >
              <span className="text-muted-foreground">Auto-Reply:</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  autoReplyEnabled
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {autoReplyEnabled ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          {/* Add Review Button */}
          <Button
            size="sm"
            onClick={() => setShowAddReview(!showAddReview)}
            className="rounded-xl text-xs bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5 font-bold shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>{showAddReview ? "Cancel" : "Add Review"}</span>
          </Button>

          {/* Sync from Google Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncReviews}
            disabled={isSyncing}
            className="rounded-xl text-xs border-border text-foreground hover:bg-muted h-8 gap-1.5 font-bold shadow-xs"
          >
            <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync from Google"}</span>
          </Button>

          {/* Subtle Clear Dummy Reviews Button */}
          {reviews.some(
            (r) => r.name === "Rajesh Kumar" || r.name === "Pooja Sharma" || (r as any).is_dummy
          ) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearDummyReviews}
              disabled={isClearingDummy}
              className="rounded-xl text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-8 gap-1 px-2.5"
              title="Clear Test Dummy Reviews"
            >
              <Trash2 className="size-3.5" />
              <span>Clear Test Data</span>
            </Button>
          )}
        </div>
      </div>

      {/* Inline Add Review Form */}
      {showAddReview && (
        <form
          onSubmit={handleAddReview}
          className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3.5 transition-all shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Star className="size-4 text-amber-400 fill-amber-400" />
              Add Customer Review for {activeLocationName || "Active Profile"}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddReview(false)}
              className="h-6 w-6 p-0 text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Customer Name *</label>
              <Input
                placeholder="e.g. Ramesh Sharma"
                value={newRevName}
                onChange={(e) => setNewRevName(e.target.value)}
                required
                className="h-8 text-xs rounded-xl bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-foreground">Rating</label>
              <select
                value={newRevRating}
                onChange={(e) => setNewRevRating(e.target.value)}
                className="h-8 w-full text-xs rounded-xl border border-border bg-background px-2 text-foreground focus:outline-hidden"
              >
                <option value="5">★★★★★ (5 Stars - Excellent)</option>
                <option value="4">★★★★☆ (4 Stars - Good)</option>
                <option value="3">★★★☆☆ (3 Stars - Average)</option>
                <option value="2">★★☆☆☆ (2 Stars - Needs Improvement)</option>
                <option value="1">★☆☆☆☆ (1 Star - Poor)</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <label className="text-[11px] font-semibold text-foreground">
                Customer Review Comment *
              </label>
              <Textarea
                placeholder="e.g. Excellent service! Studio album quality was beyond expectations."
                value={newRevComment}
                onChange={(e) => setNewRevComment(e.target.value)}
                required
                rows={2}
                className="text-xs rounded-xl bg-background resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddReview(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isAddingRev}
              className="rounded-xl text-xs bg-primary text-primary-foreground font-bold"
            >
              {isAddingRev ? "Saving..." : "Save Review"}
            </Button>
          </div>
        </form>
      )}

      {/* Review Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-border/70 shadow-xs p-3.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Overall Rating
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-foreground">
              {reviews.length > 0
                ? (
                    reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
                  ).toFixed(1)
                : "5.0"}
            </span>
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-3 fill-amber-400" />
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Based on {reviews.length} reviews
          </p>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-xs p-3.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Response Rate
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-emerald-400">
              {reviews.length > 0
                ? Math.round(
                    (reviews.filter((r) => r.replied).length / reviews.length) * 100
                  )
                : 100}
              %
            </span>
            <Badge
              variant="outline"
              className="text-[9px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
            >
              Live
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {reviews.filter((r) => r.replied).length} of {reviews.length} replied
          </p>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-xs p-3.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            5★ Ratings
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-foreground">
              {reviews.filter((r) => r.rating === 5).length}
            </span>
            <span className="text-[10px] text-emerald-400 font-bold">
              {reviews.length > 0
                ? Math.round(
                    (reviews.filter((r) => r.rating === 5).length / reviews.length) * 100
                  )
                : 100}
              %
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">Positive customer trust</p>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-xs p-3.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Pending Replies
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-amber-400">
              {unrepliedCount}
            </span>
            {unrepliedCount > 0 ? (
              <Badge
                variant="outline"
                className="text-[9px] text-amber-400 border-amber-500/30 bg-amber-500/10"
              >
                Needs Action
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[9px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              >
                All Clear
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">1-click AI replies ready</p>
        </Card>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border text-muted-foreground text-xs">
            No reviews match the selected filter criteria.
          </div>
        ) : (
          filteredReviews.map((rev) => (
            <Card key={rev.id} className="rounded-2xl border-border/70 shadow-xs hover:border-border transition-all">
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 ring-1 ring-border/50">
                      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                        {rev.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{rev.name}</span>
                        <span className="text-[11px] text-muted-foreground">· {rev.date}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`size-3.5 ${
                                i < rev.rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-muted/60"
                              }`}
                            />
                          ))}
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            rev.sentiment === "positive"
                              ? "text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-300"
                          }
                        >
                          {rev.sentiment === "positive" ? "Positive Sentiment" : "Needs Care"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div>
                    {rev.replied ? (
                      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                        <CheckCircle2 className="size-3 mr-1" /> Replied to Google
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] font-semibold">
                        Awaiting Reply
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed pl-13">
                  {rev.comment}
                </p>

                {/* Published Reply Section */}
                {rev.replied && rev.replyText && (
                  <div className="ml-13 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-primary font-semibold text-[11px]">
                      <Bot className="size-3.5" />
                      Aibotflow Official Response:
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {rev.replyText}
                    </p>
                  </div>
                )}

                {/* AI Reply Formulation for Unreplied */}
                {!rev.replied && (
                  <div className="ml-13 rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Wand2 className="size-3.5 text-primary" /> AI Smart Reply
                        </span>
                        <div className="flex items-center gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setTone("friendly")}
                            className={`rounded-lg px-2 py-0.5 ${tone === "friendly" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground"}`}
                          >
                            Friendly
                          </button>
                          <button
                            type="button"
                            onClick={() => setTone("grateful")}
                            className={`rounded-lg px-2 py-0.5 ${tone === "grateful" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground"}`}
                          >
                            Grateful
                          </button>
                          <button
                            type="button"
                            onClick={() => setTone("professional")}
                            className={`rounded-lg px-2 py-0.5 ${tone === "professional" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground"}`}
                          >
                            Pro
                          </button>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={generatingId === rev.id}
                        onClick={() => generateAiReply(rev)}
                        className="rounded-xl text-xs h-7"
                      >
                        <Sparkles className={`size-3 mr-1 text-primary ${generatingId === rev.id ? "animate-spin" : ""}`} />
                        {generatingId === rev.id ? "Drafting..." : "Generate AI Reply"}
                      </Button>
                    </div>

                    <Textarea
                      rows={3}
                      placeholder="Click 'Generate AI Reply' or type custom reply..."
                      value={activeReplyTexts[rev.id] || ""}
                      onChange={(e) =>
                        setActiveReplyTexts((prev) => ({
                          ...prev,
                          [rev.id]: e.target.value,
                        }))
                      }
                      className="text-xs rounded-xl bg-background"
                    />

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        disabled={!activeReplyTexts[rev.id]?.trim()}
                        onClick={() => {
                          const replyStr = activeReplyTexts[rev.id]?.trim();
                          if (replyStr) {
                            navigator.clipboard.writeText(replyStr);
                            toast.success("AI reply copied to clipboard! Opening Google...");
                          }
                          const targetUrl =
                            activeLocationWebsite ||
                            `https://www.google.com/search?q=${encodeURIComponent(activeLocationName || "My Business")}+reviews`;
                          window.open(targetUrl, "_blank");
                        }}
                        className="rounded-xl text-xs h-8 gap-1.5"
                      >
                        <Copy className="size-3 text-primary" /> Copy & Open Maps
                      </Button>
                      <Button
                        size="sm"
                        disabled={!activeReplyTexts[rev.id]?.trim()}
                        onClick={() => handlePostReply(rev.id)}
                        className="rounded-xl text-xs h-8"
                      >
                        <Send className="size-3 mr-1.5" /> Approve & Post to Google
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
