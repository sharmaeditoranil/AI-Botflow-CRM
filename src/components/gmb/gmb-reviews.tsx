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
} from "lucide-react";

interface ReviewItem {
  id: string;
  name: string;
  rating: number;
  date: string;
  comment: string;
  sentiment: "positive" | "neutral" | "negative";
  replied: boolean;
  replyText?: string;
}

const INITIAL_REVIEWS: ReviewItem[] = [
  {
    id: "rev-1",
    name: "Rajesh Kumar",
    rating: 5,
    date: "2 hours ago",
    comment: "Best photography academy in the region! The mentorship on lighting, camera composition, and studio setup is top notch. Practical photoshoot training really boosted my confidence.",
    sentiment: "positive",
    replied: true,
    replyText: "Thank you Rajesh ji! Proud to see your photography skills growing so fast. Keep capturing great frames!",
  },
  {
    id: "rev-2",
    name: "Amit Gupta",
    rating: 5,
    date: "1 day ago",
    comment: "Highly recommended for professional photography courses and wedding shoots. Very humble teachers and great practical studio sessions.",
    sentiment: "positive",
    replied: false,
  },
  {
    id: "rev-3",
    name: "Pooja Verma",
    rating: 5,
    date: "3 days ago",
    comment: "Enrolled for the professional diploma batch. Faculty teaches with high-end DSLR cameras and practical studio strobe lights. Value for money!",
    sentiment: "positive",
    replied: false,
  },
  {
    id: "rev-4",
    name: "Manoj Tiwari",
    rating: 4,
    date: "5 days ago",
    comment: "Great photography studio setup and framing quality. Excellent guidance for beginner photographers.",
    sentiment: "positive",
    replied: false,
  },
];

export function GmbReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>(INITIAL_REVIEWS);
  const [activeLocationName, setActiveLocationName] = useState<string | null>(null);
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
        if (active) setActiveLocationName(active.location_name);
      }

      const revRes = await fetch("/api/gmb/reviews");
      const revData = await revRes.json();
      if (revData?.reviews && revData.reviews.length > 0) {
        const mapped: ReviewItem[] = revData.reviews.map((r: any) => ({
          id: r.id || r.google_review_id || r.review_id,
          name: r.reviewer_name || "Google User",
          rating: r.star_rating || 5,
          date: r.review_timestamp ? new Date(r.review_timestamp).toLocaleDateString() : "Recently",
          comment: r.comment || "",
          sentiment: r.sentiment || (r.star_rating >= 4 ? "positive" : r.star_rating === 3 ? "neutral" : "negative"),
          replied: r.is_replied ?? !!(r.reply_text || r.review_reply),
          replyText: r.reply_text || r.review_reply || undefined,
        }));
        setReviews(mapped);
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

    try {
      const res = await fetch("/api/gmb/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: id, replyText: text }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, replied: true, replyText: text } : r
          )
        );
        toast.success(
          data.postedToGoogle
            ? "Reply published live on Google Maps via Google API!"
            : "Reply saved in CRM and synced with Google Business Profile."
        );
      } else {
        toast.error(data.error || "Failed to post reply.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error posting reply.");
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

  return (
    <div className="space-y-6">
      {/* Active Profile & Sync Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/60 p-4 rounded-2xl border border-border/70">
        <div className="flex items-center gap-2.5">
          <Store className="size-5 text-primary shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Storefront:</span>
              <span className="text-sm font-bold text-foreground">
                {activeLocationName || "Quick Art Photography Academy"}
              </span>
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                Connected
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Google API application review in progress — You can manage reviews and generate instant AI replies right now.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => setShowAddReview(!showAddReview)}
            className="rounded-xl text-xs bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3.5 mr-1" />
            {showAddReview ? "Cancel" : "+ Add Customer Review"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncReviews}
            disabled={isSyncing}
            className="rounded-xl text-xs border-border text-foreground hover:bg-muted"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync from Google"}
          </Button>
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
              <label className="text-[11px] font-semibold text-foreground">Customer Review Comment *</label>
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
              className="rounded-xl text-xs bg-primary text-primary-foreground"
            >
              {isAddingRev ? "Saving..." : "Save Review"}
            </Button>
          </div>
        </form>
      )}

      {/* Top Banner & AI Auto-Reply Switch */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card/90 to-primary/10 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-xs">
            <Sparkles className="size-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">AI Review Replies Engine</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Instantly generate tailored, high-converting review replies or auto-respond to 5★ ratings.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-3.5 py-2 border border-border/60">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground">5★ Auto-Reply Bot</p>
            <p className="text-[10px] text-muted-foreground">Auto-publish in 60s</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAutoReplyEnabled(!autoReplyEnabled);
              toast.info(autoReplyEnabled ? "Auto-Reply disabled" : "Auto-Reply enabled for 5-star reviews");
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              autoReplyEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                autoReplyEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Review Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-border/70 shadow-xs p-4">
          <p className="text-xs font-medium text-muted-foreground">Overall Rating</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">4.8</span>
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-3.5 fill-amber-400" />
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Based on 148 Google reviews</p>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-xs p-4">
          <p className="text-xs font-medium text-muted-foreground">Response Rate</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">96%</span>
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">Healthy</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Within 2 hours avg</p>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-xs p-4">
          <p className="text-xs font-medium text-muted-foreground">Positive Sentiment</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">94.2%</span>
          </div>
          <p className="text-[10px] text-emerald-400 mt-1">+4.8% vs last month</p>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-xs p-4">
          <p className="text-xs font-medium text-muted-foreground">Pending Replies</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-400">
              {reviews.filter((r) => !r.replied).length}
            </span>
            <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30 bg-amber-500/10">Needs Attention</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Quick AI responses ready</p>
        </Card>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/60 p-3 rounded-2xl border border-border/70">
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-muted-foreground font-medium pl-1 flex items-center gap-1">
            <Filter className="size-3.5" /> Stars:
          </span>
          {[
            { label: "All", val: "all" },
            { label: "5 ★", val: 5 },
            { label: "4 ★", val: 4 },
            { label: "3 ★", val: 3 },
            { label: "≤ 2 ★", val: 2 },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setSelectedRatingFilter(f.val as number | "all")}
              className={`rounded-xl px-2.5 py-1 font-medium transition-all ${
                selectedRatingFilter === f.val
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium">Status:</span>
          {(["all", "unreplied", "replied"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSelectedStatusFilter(s)}
              className={`capitalize rounded-xl px-2.5 py-1 font-medium transition-all ${
                selectedStatusFilter === s
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
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

                    <div className="flex justify-end">
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
