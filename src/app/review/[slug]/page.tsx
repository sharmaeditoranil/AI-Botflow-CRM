"use client";

import { use, useEffect, useState } from "react";
import { Star, CheckCircle2, AlertCircle, ArrowRight, MessageSquare, Sparkles, Send, ShieldCheck, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PublicMagicQrData {
  id: string;
  slug: string;
  business_name: string;
  google_review_url: string;
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
  const [isRedirecting, setIsRedirecting] = useState(false);

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
        } else {
          setError(json.error || "Review link is inactive or not found.");
        }
      } catch (err: any) {
        setError("Network error loading review page.");
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, [slug]);

  const handleSelectRating = (rating: number) => {
    setSelectedRating(rating);
    const minStars = data?.min_star_for_google ?? 4;

    if (rating >= minStars) {
      // Positive rating: Redirect directly to Google Maps
      setIsRedirecting(true);
      setTimeout(() => {
        const targetUrl = data?.google_review_url?.trim()
          ? data.google_review_url.trim()
          : `https://www.google.com/search?q=${encodeURIComponent(data?.business_name || "Google Business")}`;
        window.location.href = targetUrl;
      }, 1200);
    }
  };

  const handleSubmitPrivateFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    try {
      setSubmittingFeedback(true);
      const res = await fetch("/api/gmb/feedback", {
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

      if (res.ok) {
        setFeedbackSubmitted(true);
      }
    } catch {
      // Continue gracefully
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
          <p className="text-sm text-slate-400">Loading experience...</p>
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
          <Sparkles className="size-3" /> Verified Business Customer Feedback
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {data.business_name}
        </h1>
        <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          Powered by Magic QR Customer Satisfaction
        </p>
      </header>

      {/* Main Review Card */}
      <main className="max-w-md mx-auto w-full my-auto py-6">
        <Card className="bg-slate-900/90 border-slate-800 backdrop-blur-xl shadow-2xl overflow-hidden rounded-2xl">
          <CardContent className="p-6 sm:p-8 text-center">
            {feedbackSubmitted ? (
              // State 3: Private Feedback Submitted Successfully
              <div className="space-y-4 py-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="size-8" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {data.thank_you_title || "Thank you for sharing your feedback!"}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {data.thank_you_message || "We take your experience very seriously. Our management has received your notes and will take immediate corrective action."}
                </p>
                <div className="pt-4 border-t border-slate-800">
                  <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                    <Heart className="size-3 text-rose-500 fill-rose-500" />
                    We appreciate your honest support.
                  </p>
                </div>
              </div>
            ) : isRedirecting ? (
              // State 2: 4-5 Stars Celebration & Redirect to Google Maps
              <div className="space-y-4 py-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="size-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center animate-bounce">
                  <Star className="size-8 fill-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Thank You for the {selectedRating}-Star Love! 🎉
                </h3>
                <p className="text-sm text-slate-300">
                  Redirecting you to Google Reviews to publish your 5-star review on Google Maps...
                </p>
                <div className="flex items-center justify-center gap-2 pt-2 text-xs text-primary font-semibold">
                  <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  Opening Google Maps...
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
                    Please tell us what went wrong so the manager can personally fix this for you.
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
                    <p className={`text-xs font-bold uppercase tracking-wider ${RATING_EMOJIS[hoverRating].color} animate-in fade-in`}>
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
        Protected by Smart QR Review Filter • Verified Local Business
      </footer>
    </div>
  );
}
