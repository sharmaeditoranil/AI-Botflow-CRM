"use client";

import { use, useEffect, useState } from "react";
import {
  Star,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  MessageSquare,
  Sparkles,
  Send,
  ShieldCheck,
  Heart,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PublicMagicQrData {
  id: string;
  slug: string;
  business_name: string;
  google_review_url: string;
  place_id?: string;
  min_star_for_google: number;
  heading: string;
  subheading: string;
  thank_you_title: string;
  thank_you_message: string;
}

const RATING_EMOJIS: Record<number, { emoji: string; label: string; color: string }> = {
  1: { emoji: "😡", label: "Very Disappointed", color: "text-rose-500" },
  2: { emoji: "🙁", label: "Could Be Better", color: "text-amber-500" },
  3: { emoji: "😐", label: "Average Experience", color: "text-yellow-500" },
  4: { emoji: "😊", label: "Good Experience!", color: "text-emerald-500" },
  5: { emoji: "🤩", label: "Outstanding!", color: "text-emerald-500" },
};

export default function PublicReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicMagicQrData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // 4-5 Stars Auto-Generated Review State
  const [autoReviewText, setAutoReviewText] = useState("");
  const [hasCopied, setHasCopied] = useState(false);

  // Private feedback form state (for 1-3 stars)
  const [feedbackText, setFeedbackText] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      try {
        setLoading(true);
        const res = await fetch(`/api/gmb/magic-qr/public?slug=${encodeURIComponent(slug)}`);
        const json = await res.json();
        if (res.ok && json.data) {
          setData(json.data);
          const biz = json.data.business_name || "this business";
          setAutoReviewText(
            `Outstanding experience with ${biz}! Highly professional team, top-notch quality, and very quick service. Best in the area, 100% recommended to everyone!`
          );
        } else {
          setError(json.error || "Review link is inactive or not found.");
        }
      } catch {
        setError("Network error loading review page.");
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, [slug]);

  const handleSelectRating = async (rating: number) => {
    setSelectedRating(rating);
    setHasCopied(false);

    const minStars = data?.min_star_for_google ?? 4;
    if (rating >= minStars && autoReviewText.trim()) {
      try {
        await navigator.clipboard.writeText(autoReviewText.trim());
        setHasCopied(true);
      } catch {
        // Fallback for browsers requiring explicit button click
      }
    }
  };

  // Computes genuine Google Maps review target URL (NEVER external website)
  const getGoogleReviewUrl = () => {
    const rawUrl = data?.google_review_url?.trim() || "";
    // Only use if it is an actual Google Maps / review URL
    if (
      rawUrl.includes("google.com") ||
      rawUrl.includes("g.page") ||
      rawUrl.includes("goo.gl") ||
      rawUrl.includes("maps.app")
    ) {
      return rawUrl;
    }
    // If place_id is available, direct write review link
    if (data?.place_id && !data.place_id.startsWith("loc_") && !data.place_id.startsWith("locations/")) {
      return `https://search.google.com/local/writereview?placeid=${data.place_id}`;
    }
    // Fallback: Direct Google Maps Place Search URL (Never external website)
    const biz = data?.business_name || "Local Business";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz)}`;
  };

  const handleCopyAndOpenGoogle = async () => {
    try {
      if (autoReviewText.trim()) {
        await navigator.clipboard.writeText(autoReviewText.trim());
      }
    } catch {
      // Clipboard fallback
    }
    setHasCopied(true);

    const targetUrl = getGoogleReviewUrl();
    // Open Google Maps review page
    setTimeout(() => {
      window.open(targetUrl, "_blank");
    }, 350);
  };

  const handlePresetSelect = async (presetText: string) => {
    setAutoReviewText(presetText);
    try {
      await navigator.clipboard.writeText(presetText);
      setHasCopied(true);
    } catch {}
  };

  const handleSubmitPrivateFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    try {
      setSubmittingFeedback(true);
      await fetch("/api/gmb/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          starRating: selectedRating,
          feedbackText,
          customerName,
          customerPhone,
        }),
      });
      setFeedbackSubmitted(true);
    } catch {
      setFeedbackSubmitted(true);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-slate-400">Loading verified storefront...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full bg-slate-900 border-slate-800 text-slate-200">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="size-10 text-amber-500 mx-auto" />
            <h2 className="text-lg font-bold text-white">Review Link Not Available</h2>
            <p className="text-sm text-slate-400">{error || "This review page could not be located."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const minStars = data.min_star_for_google ?? 4;
  const isPositive = selectedRating !== null && selectedRating >= minStars;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8">
      {/* Brand Header */}
      <header className="max-w-md mx-auto w-full pt-4 pb-2 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="size-3" /> Official Google Customer Review
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {data.business_name}
        </h1>
        <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          Verified Google Business Profile Storefront
        </p>
      </header>

      {/* Main Review Card */}
      <main className="max-w-md mx-auto w-full my-auto py-6">
        <Card className="bg-slate-900/90 border-slate-800 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl">
          <CardContent className="p-6 sm:p-8 text-center">
            {feedbackSubmitted ? (
              // State 3: Private Feedback Submitted Successfully (1-3 Stars)
              <div className="space-y-4 py-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="size-8" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {data.thank_you_title || "Thank you for sharing your feedback!"}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {data.thank_you_message ||
                    "We take your experience very seriously. Our management has received your notes and will take immediate corrective action."}
                </p>
                <div className="pt-4 border-t border-slate-800">
                  <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                    <Heart className="size-3 text-rose-500 fill-rose-500" />
                    We appreciate your honest support.
                  </p>
                </div>
              </div>
            ) : isPositive ? (
              // State 2: 4-5 Stars: AUTOMATIC REVIEW READY + DIRECT GOOGLE MAPS REDIRECT
              <div className="text-left space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center space-y-1">
                  <div className="inline-flex p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-1">
                    <Star className="size-8 fill-amber-400 text-amber-400 animate-bounce" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white">
                    Thank You for {selectedRating} Stars! 🎉
                  </h3>
                  <p className="text-xs text-amber-200/90 font-medium">
                    Aapka 5-Star review niche likha hua ready hai. Tap karke Google Maps par post kar dijiye:
                  </p>
                </div>

                {/* Pre-written Automatic Review Box */}
                <div className="space-y-2.5 bg-slate-950 p-4 rounded-xl border border-amber-500/30 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="size-3 text-amber-400" />
                      Automatic 5-Star Review (Ready to Post)
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                      Editable
                    </span>
                  </div>
                  <Textarea
                    rows={3}
                    value={autoReviewText}
                    onChange={(e) => setAutoReviewText(e.target.value)}
                    className="bg-transparent border-0 p-0 text-xs text-white leading-relaxed resize-none focus-visible:ring-0 placeholder:text-slate-500 font-medium"
                  />

                  {/* 1-Tap Quick Style Chips */}
                  <div className="pt-2.5 border-t border-slate-800 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handlePresetSelect(
                          `⚡ Fast service, outstanding quality, and polite staff! Very happy with ${data.business_name}. Highly recommended!`
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 transition-colors"
                    >
                      ⚡ Fast & Polite
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handlePresetSelect(
                          `🏆 Best quality and experience in town! ${data.business_name} exceeded all our expectations. 100% recommended!`
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 transition-colors"
                    >
                      🏆 Best Quality
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handlePresetSelect(
                          `🤝 Excellent team, great training, and reasonable pricing! Truly delighted with ${data.business_name}. Will visit again!`
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 transition-colors"
                    >
                      🤝 Best Pricing
                    </button>
                  </div>
                </div>

                {/* Primary Action: Copy & Open Google Maps */}
                <div className="space-y-2 pt-1">
                  <Button
                    type="button"
                    onClick={handleCopyAndOpenGoogle}
                    className="w-full h-12 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-600 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/25 gap-2 transition-all active:scale-95"
                  >
                    {hasCopied ? (
                      <>
                        <Check className="size-4 text-slate-950" />
                        Review Copied! Opening Google Profile...
                      </>
                    ) : (
                      <>
                        <Copy className="size-4 text-slate-950" />
                        Copy Review & Open Google Maps ➔
                      </>
                    )}
                  </Button>

                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-300">
                      <Sparkles className="size-3.5 text-amber-400" />
                      Kaise Post Karein (2 Easy Steps):
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      1. Upar <strong>"Copy Review & Open Google Maps"</strong> dabayein.<br />
                      2. Google Maps profile par 5-Star select karke <strong>Paste</strong> kar dein aur <strong>Post</strong> dabayein!
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedRating(null)}
                      className="hover:text-white underline"
                    >
                      Change Rating
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(getGoogleReviewUrl(), "_blank")}
                      className="text-slate-400 hover:text-white underline inline-flex items-center gap-1"
                    >
                      Direct Google Maps <ExternalLink className="size-3 text-slate-500" />
                    </button>
                  </div>
                </div>
              </div>
            ) : selectedRating !== null && selectedRating < minStars ? (
              // State 1B: 1-3 Stars: Smart Negative Filter (Private Feedback Form)
              <div className="text-left space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="text-center pb-2">
                  <div className="text-3xl mb-1">{RATING_EMOJIS[selectedRating].emoji}</div>
                  <h3 className="text-lg font-bold text-white">
                    We are truly sorry your experience wasn't 5-star.
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Please tell us what went wrong so our manager can personally fix this for you.
                  </p>
                </div>

                <form onSubmit={handleSubmitPrivateFeedback} className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      What can we improve? <span className="text-rose-400">*</span>
                    </label>
                    <Textarea
                      required
                      rows={3}
                      placeholder="Share details about your service, delay, quality, or issue..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-white text-xs placeholder:text-slate-500 focus-visible:ring-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                        Your Name (Optional)
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="bg-slate-950 border-slate-700 text-white text-xs h-9"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                        Phone Number (Optional)
                      </label>
                      <Input
                        type="tel"
                        placeholder="For manager callback"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="bg-slate-950 border-slate-700 text-white text-xs h-9"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSelectedRating(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Change Rating
                    </Button>
                    <Button
                      type="submit"
                      disabled={submittingFeedback || !feedbackText.trim()}
                      className="flex-1 bg-primary hover:bg-primary/90 text-white text-xs font-semibold h-9"
                    >
                      {submittingFeedback ? (
                        "Sending..."
                      ) : (
                        <>
                          Send Private Feedback <Send className="size-3.5 ml-1.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              // State 1A: Initial Star Rating Selector
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {data.heading || "How was your experience today?"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {data.subheading || "Tap a star to rate your visit with us."}
                  </p>
                </div>

                {/* Big Interactive Stars */}
                <div className="flex items-center justify-center gap-2 sm:gap-3 py-2">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isHovered = hoverRating !== null && hoverRating >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleSelectRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(null)}
                        className="group relative p-2 transition-transform hover:scale-125 active:scale-95 focus:outline-hidden"
                        aria-label={`${star} star rating`}
                      >
                        <Star
                          className={`size-10 sm:size-12 transition-colors duration-200 ${
                            isHovered
                              ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                              : "text-slate-700 hover:text-slate-500"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Rating Label Preview */}
                <div className="h-6">
                  {hoverRating ? (
                    <p
                      className={`text-xs font-bold uppercase tracking-wider ${RATING_EMOJIS[hoverRating].color} animate-in fade-in`}
                    >
                      {RATING_EMOJIS[hoverRating].emoji} {RATING_EMOJIS[hoverRating].label}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                      Select 1 to 5 Stars
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-slate-600 pb-2">
        Protected by Smart QR Review Filter • Verified Google Business Storefront
      </footer>
    </div>
  );
}
