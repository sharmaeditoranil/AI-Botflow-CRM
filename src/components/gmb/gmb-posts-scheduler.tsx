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
  Sparkles,
  Clock,
  Send,
  Calendar,
  Layers,
  Wand2,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Share2,
  Tag,
  Store,
  RefreshCw,
  ExternalLink,
  Flame,
  Zap,
} from "lucide-react";

interface GmbPostItem {
  id: string;
  topic_type: string;
  summary?: string;
  content: string;
  call_to_action_type: string;
  call_to_action_url?: string;
  media_url?: string;
  status: "draft" | "scheduled" | "published" | "failed";
  scheduled_at?: string;
  published_at?: string;
  created_at: string;
}

export function GmbPostsScheduler() {
  const [posts, setPosts] = useState<GmbPostItem[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [activeTab, setActiveTab] = useState<"create" | "scheduled" | "history">("create");

  // Generator form
  const [topicType, setTopicType] = useState<"OFFER" | "UPDATE" | "EVENT" | "FESTIVAL">("OFFER");
  const [topic, setTopic] = useState("");
  const [offerDetails, setOfferDetails] = useState("");
  const [callToAction, setCallToAction] = useState("BOOK");
  const [ctaUrl, setCtaUrl] = useState("");
  const [language, setLanguage] = useState("hinglish");
  const [tone, setTone] = useState("engaging");
  const [isGenerating, setIsGenerating] = useState(false);

  // Result state
  const [generatedHeadline, setGeneratedHeadline] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [imageIdea, setImageIdea] = useState("");

  // Scheduling states
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Business info
  const [businessName, setBusinessName] = useState("Our Business");
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoadingPosts(true);
      // Fetch locations for business name
      const cfgRes = await fetch("/api/gmb/config");
      const cfg = await cfgRes.json();
      if (cfg?.activeLocation) {
        setBusinessName(cfg.activeLocation.location_name || "Our Business");
        setActiveLocationId(cfg.activeLocation.id || null);
        if (cfg.activeLocation.website) {
          setCtaUrl(cfg.activeLocation.website);
        }
      }

      // Fetch posts
      const pRes = await fetch("/api/gmb/posts");
      const pData = await pRes.json();
      if (pRes.ok && pData.posts) {
        setPosts(pData.posts);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set default schedule date to tomorrow 10:00 AM
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const localIso = tomorrow.toISOString().slice(0, 16);
    setScheduleDateTime(localIso);
  }, []);

  const handleGenerateAiPost = async () => {
    if (!topic.trim() && !offerDetails.trim()) {
      toast.error("Please enter a topic or offer details for the AI to write about");
      return;
    }

    try {
      setIsGenerating(true);
      const res = await fetch("/api/gmb/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          topicType,
          topic,
          offerDetails,
          callToAction,
          language,
          tone,
        }),
      });

      const json = await res.json();
      if (res.ok && json.data) {
        setGeneratedHeadline(json.data.headline || "");
        setGeneratedContent(json.data.content || "");
        setGeneratedHashtags(json.data.hashtags || []);
        setImageIdea(json.data.imageIdeaPrompt || "");
        toast.success("AI generated your high-converting GMB post!");
      } else {
        toast.error(json.error || "Failed to generate post with AI");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error generating post");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePost = async (publishImmediately: boolean) => {
    const fullContent = generatedContent.trim();
    if (!fullContent) {
      toast.error("Post content cannot be empty. Generate with AI or write below.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/gmb/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: activeLocationId,
          topicType,
          summary: generatedHeadline,
          content: `${fullContent}\n\n${generatedHashtags.join(" ")}`,
          callToActionType: callToAction,
          callToActionUrl: ctaUrl,
          scheduledAt: publishImmediately ? null : scheduleDateTime,
          publishImmediately,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || "Post created successfully!");
        setGeneratedHeadline("");
        setGeneratedContent("");
        setGeneratedHashtags([]);
        setImageIdea("");
        await loadData();
        setActiveTab(publishImmediately ? "history" : "scheduled");
      } else {
        toast.error(json.error || "Failed to save post");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    try {
      const res = await fetch(`/api/gmb/posts?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        toast.success("Post deleted");
      }
    } catch {
      toast.error("Failed to delete post");
    }
  };

  const handlePublishNow = async (id: string) => {
    try {
      const res = await fetch("/api/gmb/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "publish_now" }),
      });
      if (res.ok) {
        toast.success("Post published immediately!");
        await loadData();
      }
    } catch {
      toast.error("Failed to publish post");
    }
  };

  const setOptimalTimePreset = (hour: number, minute: number, dayOffset = 1) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    setScheduleDateTime(d.toISOString().slice(0, 16));
    toast.info(`Scheduled for ${d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "numeric" })}`);
  };

  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  const publishedPosts = posts.filter((p) => p.status === "published" || p.status === "draft");

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-blue-500/20 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider">
              <Sparkles className="size-3" /> Features 01 & 02
            </div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              AI Post Generation & Smart Scheduling
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
              Create engaging, localized Google My Business updates, festival wishes, and seasonal discount offers with AI in seconds. Schedule them at optimal peak engagement times for maximum Google Maps reach!
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs bg-card gap-1.5 py-1 px-3 border-border">
              <Clock className="size-3.5 text-primary" />
              <span>{scheduledPosts.length} Scheduled</span>
            </Badge>
            <Badge variant="outline" className="text-xs bg-card gap-1.5 py-1 px-3 border-border">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              <span>{publishedPosts.length} Published</span>
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <Button
          size="sm"
          variant={activeTab === "create" ? "default" : "ghost"}
          onClick={() => setActiveTab("create")}
          className="text-xs gap-1.5 h-8 font-semibold"
        >
          <Wand2 className="size-3.5" /> AI Post Generator
        </Button>
        <Button
          size="sm"
          variant={activeTab === "scheduled" ? "default" : "ghost"}
          onClick={() => setActiveTab("scheduled")}
          className="text-xs gap-1.5 h-8 font-semibold relative"
        >
          <Clock className="size-3.5" />
          Scheduled Queue ({scheduledPosts.length})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "history" ? "default" : "ghost"}
          onClick={() => setActiveTab("history")}
          className="text-xs gap-1.5 h-8 font-semibold"
        >
          <Layers className="size-3.5" /> Post History ({publishedPosts.length})
        </Button>
      </div>

      {/* TAB 1: AI Post Generator & Scheduler */}
      {activeTab === "create" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: Inputs */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Create Google Business Post</span>
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                    For: {businessName}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Fill in your post details or let AI generate the full copy, hashtags, and CTA button.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Post Type Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Post Category</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "OFFER", label: "Special Offer", icon: "🏷️" },
                      { id: "UPDATE", label: "What's New", icon: "📢" },
                      { id: "EVENT", label: "Event / Webinar", icon: "📅" },
                      { id: "FESTIVAL", label: "Festival Greeting", icon: "🪔" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTopicType(t.id as any)}
                        className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold transition-all text-left ${
                          topicType === t.id
                            ? "bg-primary/15 border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        <span>{t.icon}</span>
                        <span className="truncate">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Topic / Details */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Topic / Product / Announcement</Label>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Wedding Photography booking open for this season"
                    className="text-xs h-9"
                  />
                </div>

                {/* Offer Details if OFFER */}
                {topicType === "OFFER" && (
                  <div className="space-y-1.5 animate-in fade-in">
                    <Label className="text-xs font-semibold">Discount / Benefit Details</Label>
                    <Input
                      value={offerDetails}
                      onChange={(e) => setOfferDetails(e.target.value)}
                      placeholder="e.g. Flat 20% discount on HD Album printing & Candid Shoots"
                      className="text-xs h-9"
                    />
                  </div>
                )}

                {/* Language & Tone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Language Style</Label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full text-xs h-9 rounded-md border border-input bg-background px-3 py-1 text-foreground shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="hinglish">Hinglish (Natural Indian Conversational)</option>
                      <option value="english">Professional English</option>
                      <option value="hindi">Clean Hindi (हिंदी)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Tone</Label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full text-xs h-9 rounded-md border border-input bg-background px-3 py-1 text-foreground shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="engaging">Engaging & High-Converting</option>
                      <option value="urgent">Urgent & Limited-Time</option>
                      <option value="festive">Warm & Festive</option>
                      <option value="professional">Polished & Corporate</option>
                    </select>
                  </div>
                </div>

                {/* Call to Action (CTA) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Call to Action (CTA Button)</Label>
                    <select
                      value={callToAction}
                      onChange={(e) => setCallToAction(e.target.value)}
                      className="w-full text-xs h-9 rounded-md border border-input bg-background px-3 py-1 text-foreground shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="BOOK">Book Appointment (Book Online)</option>
                      <option value="CALL">Call Now</option>
                      <option value="ORDER">Order Online</option>
                      <option value="LEARN_MORE">Learn More</option>
                      <option value="SIGN_UP">Sign Up</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Button URL or Phone</Label>
                    <Input
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="https://... or +91..."
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                {/* AI Generate Button */}
                <Button
                  type="button"
                  onClick={handleGenerateAiPost}
                  disabled={isGenerating}
                  className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-primary text-white font-semibold text-xs h-9 gap-1.5 shadow-md hover:opacity-95"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" />
                      Generating Engaging GMB Post with AI...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Generate Instant Post with AI
                    </>
                  )}
                </Button>

                {/* Editable Content */}
                <div className="space-y-1.5 pt-2 border-t border-border/60">
                  <Label className="text-xs font-semibold">Headline</Label>
                  <Input
                    value={generatedHeadline}
                    onChange={(e) => setGeneratedHeadline(e.target.value)}
                    placeholder="Catchy headline generated by AI..."
                    className="text-xs h-9 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Post Body Content</Label>
                  <Textarea
                    rows={5}
                    value={generatedContent}
                    onChange={(e) => setGeneratedContent(e.target.value)}
                    placeholder="Write or review your post copy here..."
                    className="text-xs leading-relaxed"
                  />
                </div>

                {generatedHashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {generatedHashtags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] font-mono">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Google Live Preview & Smart Scheduler */}
          <div className="lg:col-span-5 space-y-4">
            {/* Live Google Post Card Preview */}
            <Card className="border-border/70 shadow-sm overflow-hidden bg-card">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Google Maps / Search Preview</span>
                  <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-500 border-blue-500/30">
                    Live Snippet
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {/* Storefront Header */}
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                    <Store className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground leading-tight">
                      {businessName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Google Business Post • Just now</p>
                  </div>
                </div>

                {/* Banner Placeholder */}
                <div className="w-full h-36 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center p-3 text-center text-slate-300">
                  <Sparkles className="size-6 text-amber-400 mb-1" />
                  <p className="text-xs font-semibold text-white">
                    {generatedHeadline || "Your Post Banner"}
                  </p>
                  <p className="text-[10px] text-slate-400 max-w-xs line-clamp-2 mt-0.5">
                    {imageIdea || "Visual image or promotional flyer will appear here."}
                  </p>
                </div>

                {/* Content snippet */}
                <div className="space-y-2">
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed line-clamp-6">
                    {generatedContent || "Generate or type your post content to preview how it looks to customers searching on Google Maps."}
                  </p>
                  {generatedHashtags.length > 0 && (
                    <p className="text-[11px] text-primary font-medium">
                      {generatedHashtags.join(" ")}
                    </p>
                  )}
                </div>

                {/* CTA Button Preview */}
                <div className="pt-2">
                  <Button
                    size="sm"
                    className="w-full bg-primary hover:bg-primary/90 text-white text-xs font-semibold h-8"
                  >
                    {callToAction.replace("_", " ")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Smart Scheduling Controls */}
            <Card className="border-border/70 shadow-sm bg-gradient-to-b from-card to-muted/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  Smart Schedule & Publish
                </CardTitle>
                <CardDescription className="text-xs">
                  Pick optimal peak hours or publish live to Google instantly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Peak Hours Presets */}
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                    Recommended Peak Engagement Times:
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOptimalTimePreset(10, 0)}
                      className="p-2 rounded-lg border border-border/60 hover:bg-primary/10 hover:border-primary/40 text-left text-xs transition-all"
                    >
                      <p className="font-bold text-foreground">🌅 Morning 10 AM</p>
                      <p className="text-[10px] text-muted-foreground">High search volume</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptimalTimePreset(13, 30)}
                      className="p-2 rounded-lg border border-border/60 hover:bg-primary/10 hover:border-primary/40 text-left text-xs transition-all"
                    >
                      <p className="font-bold text-foreground">☀️ Lunch 1:30 PM</p>
                      <p className="text-[10px] text-muted-foreground">Local inquiries peak</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptimalTimePreset(18, 30)}
                      className="p-2 rounded-lg border border-border/60 hover:bg-primary/10 hover:border-primary/40 text-left text-xs transition-all"
                    >
                      <p className="font-bold text-foreground">🌆 Evening 6:30 PM</p>
                      <p className="text-[10px] text-muted-foreground">Peak shopping & orders</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptimalTimePreset(11, 0, 2)}
                      className="p-2 rounded-lg border border-border/60 hover:bg-primary/10 hover:border-primary/40 text-left text-xs transition-all"
                    >
                      <p className="font-bold text-foreground">🎉 Weekend Special</p>
                      <p className="text-[10px] text-muted-foreground">Highest local traffic</p>
                    </button>
                  </div>
                </div>

                {/* Custom Date & Time Picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Custom Scheduled Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={scheduleDateTime}
                    onChange={(e) => setScheduleDateTime(e.target.value)}
                    className="text-xs h-9 bg-background"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => handleSavePost(false)}
                    disabled={isSubmitting || !generatedContent.trim()}
                    className="w-full text-xs font-semibold h-9 bg-primary hover:bg-primary/90 text-white gap-1.5"
                  >
                    <Clock className="size-3.5" />
                    {isSubmitting ? "Scheduling..." : "Schedule Post for Selected Time"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSavePost(true)}
                    disabled={isSubmitting || !generatedContent.trim()}
                    className="w-full text-xs font-semibold h-9 gap-1.5"
                  >
                    <Send className="size-3.5 text-primary" />
                    Publish Live Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: Scheduled Queue */}
      {activeTab === "scheduled" && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                Scheduled Posts Queue ({scheduledPosts.length})
              </span>
              <Button
                size="sm"
                onClick={() => setActiveTab("create")}
                className="text-xs h-7 gap-1"
              >
                + Schedule New Post
              </Button>
            </CardTitle>
            <CardDescription className="text-xs">
              These posts will be automatically published to Google at their appointed times.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scheduledPosts.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Clock className="size-10 text-muted-foreground mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">No posts scheduled currently</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Use the AI Post Generator to draft and schedule posts for peak business hours.
                </p>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("create")}
                  className="text-xs mt-2"
                >
                  Create Your First Scheduled Post
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-4 rounded-xl border border-border/70 bg-card hover:bg-muted/30 transition-colors space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                          {post.topic_type}
                        </Badge>
                        <span className="text-xs font-bold text-foreground">
                          {post.summary || "Google Business Post"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                          <Calendar className="size-3 text-primary" />
                          Scheduled for:{" "}
                          <strong className="text-foreground">
                            {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : "Upcoming"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-3 bg-muted/40 p-3 rounded-lg border border-border/40">
                      {post.content}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        CTA: {post.call_to_action_type}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePublishNow(post.id)}
                          className="text-xs h-7 gap-1"
                        >
                          <Send className="size-3 text-primary" /> Publish Now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeletePost(post.id)}
                          className="text-xs h-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Post History */}
      {activeTab === "history" && (
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                Published & Past Posts ({publishedPosts.length})
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Archive of all posts deployed to your Google Business Profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {publishedPosts.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Layers className="size-10 text-muted-foreground mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">No published posts yet</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Publish a post now to keep your Google storefront fresh and active!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {publishedPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-4 rounded-xl border border-border/70 bg-card hover:bg-muted/30 transition-colors space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          {post.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-bold text-foreground">
                          {post.summary || "Published Post"}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {post.published_at ? new Date(post.published_at).toLocaleString() : new Date(post.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-3 bg-muted/40 p-3 rounded-lg border border-border/40">
                      {post.content}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-muted-foreground font-medium">
                        CTA: {post.call_to_action_type}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeletePost(post.id)}
                        className="text-xs h-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
