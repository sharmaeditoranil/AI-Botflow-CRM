"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  MapPin,
  PhoneCall,
  Globe,
  Navigation,
  Sparkles,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";

export interface KeywordItem {
  id: string;
  keyword: string;
  rank: number;
  searches: string;
  trend: "up" | "down" | "steady";
}

const DEFAULT_KEYWORDS: KeywordItem[] = [
  { id: "kw_1", keyword: "WhatsApp CRM software Noida", rank: 1, searches: "1.2k / mo", trend: "up" },
  { id: "kw_2", keyword: "AI WhatsApp marketing agency", rank: 2, searches: "2.4k / mo", trend: "up" },
  { id: "kw_3", keyword: "Meta Cloud API CRM India", rank: 3, searches: "950 / mo", trend: "steady" },
  { id: "kw_4", keyword: "Customer support WhatsApp automation", rank: 2, searches: "1.8k / mo", trend: "up" },
];

export function GmbGrowthScore() {
  const growthScore = 89;

  const [keywords, setKeywords] = useState<KeywordItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("wacrm:gmb:keywords");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return DEFAULT_KEYWORDS;
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New Keyword input states
  const [newKeywordText, setNewKeywordText] = useState("");
  const [newRank, setNewRank] = useState("1");
  const [newSearches, setNewSearches] = useState("1.0k / mo");
  const [newTrend, setNewTrend] = useState<"up" | "down" | "steady">("up");

  // Edit Keyword input states
  const [editKeywordText, setEditKeywordText] = useState("");
  const [editRank, setEditRank] = useState("1");
  const [editSearches, setEditSearches] = useState("");
  const [editTrend, setEditTrend] = useState<"up" | "down" | "steady">("up");

  const saveKeywords = (updated: KeywordItem[]) => {
    setKeywords(updated);
    try {
      localStorage.setItem("wacrm:gmb:keywords", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordText.trim()) {
      toast.error("Keyword text cannot be empty");
      return;
    }

    const newItem: KeywordItem = {
      id: `kw_${Date.now()}`,
      keyword: newKeywordText.trim(),
      rank: Math.max(1, parseInt(newRank) || 1),
      searches: newSearches.trim() || "500 / mo",
      trend: newTrend,
    };

    const updated = [newItem, ...keywords];
    saveKeywords(updated);
    toast.success(`Keyword "${newItem.keyword}" added to tracking!`);
    setNewKeywordText("");
    setNewRank("1");
    setNewSearches("1.0k / mo");
    setShowAddForm(false);
  };

  const handleStartEdit = (kw: KeywordItem) => {
    setEditingId(kw.id);
    setEditKeywordText(kw.keyword);
    setEditRank(String(kw.rank));
    setEditSearches(kw.searches);
    setEditTrend(kw.trend);
  };

  const handleSaveEdit = (id: string) => {
    if (!editKeywordText.trim()) {
      toast.error("Keyword text cannot be empty");
      return;
    }

    const updated = keywords.map((k) =>
      k.id === id
        ? {
            ...k,
            keyword: editKeywordText.trim(),
            rank: Math.max(1, parseInt(editRank) || 1),
            searches: editSearches.trim() || k.searches,
            trend: editTrend,
          }
        : k
    );

    saveKeywords(updated);
    setEditingId(null);
    toast.success("Keyword updated successfully!");
  };

  const handleDeleteKeyword = (id: string, name: string) => {
    const updated = keywords.filter((k) => k.id !== id);
    saveKeywords(updated);
    toast.info(`Removed keyword "${name}"`);
  };

  const metrics = [
    {
      title: "Total Search Impressions",
      value: "14,820",
      change: "+28.4%",
      period: "vs previous 30 days",
      icon: Eye,
      color: "text-primary",
    },
    {
      title: "Customer Phone Calls",
      value: "342",
      change: "+19.2%",
      period: "direct call clicks",
      icon: PhoneCall,
      color: "text-emerald-400",
    },
    {
      title: "Direction Requests",
      value: "186",
      change: "+14.5%",
      period: "Google Maps routes",
      icon: Navigation,
      color: "text-blue-400",
    },
    {
      title: "Website Inquiries",
      value: "894",
      change: "+31.0%",
      period: "clicks to website",
      icon: Globe,
      color: "text-amber-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Growth Score Hero Card */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card/90 to-primary/10 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">Google Local Visibility Growth Score</h3>
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold">
              Top 10% in Category
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your Growth Score calculates brand prominence, Google search discovery volume, review velocity, and customer action conversions.
          </p>
          <div className="flex items-center gap-2 pt-1 text-xs text-emerald-400 font-medium">
            <TrendingUp className="size-3.5" />
            <span>Score increased by +7 points this month through faster AI review replies</span>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 bg-muted/40 rounded-2xl p-4 border border-border/60">
          <div className="text-center">
            <span className="text-3xl font-extrabold text-primary">{growthScore}</span>
            <span className="text-xs text-muted-foreground">/100</span>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Growth Score</p>
          </div>
          <div className="space-y-1.5 w-28">
            <Progress value={growthScore} className="h-2 rounded-full" />
            <p className="text-[10px] text-emerald-400 font-semibold text-center">Excellent Rank</p>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, idx) => (
          <Card key={idx} className="rounded-2xl border-border/70 shadow-xs hover:border-border transition-all">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{m.title}</span>
                <div className={`p-1.5 rounded-xl bg-muted/50 ${m.color}`}>
                  <m.icon className="size-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold text-foreground">{m.value}</span>
                <span className="text-xs font-semibold text-emerald-400 flex items-center">
                  {m.change}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">{m.period}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Breakdown & Local Ranking Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Breakdown */}
        <Card className="rounded-2xl border-border/70 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Search className="size-4 text-primary" />
              Search Impressions Split
            </CardTitle>
            <CardDescription className="text-xs">
              How customers discover your business on Google
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">Discovery Searches (74%)</span>
                <span className="text-muted-foreground">10,967 views</span>
              </div>
              <Progress value={74} className="h-1.5 rounded-full" />
              <p className="text-[10px] text-muted-foreground">
                Found your listing searching for category, product, or service.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">Direct Searches (26%)</span>
                <span className="text-muted-foreground">3,853 views</span>
              </div>
              <Progress value={26} className="h-1.5 rounded-full" />
              <p className="text-[10px] text-muted-foreground">
                Searched specifically for your brand or shop name.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Local 3-Pack Keywords Tracker */}
        <Card className="lg:col-span-2 rounded-2xl border-border/70 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  Google Local 3-Pack Keyword Rankings ({keywords.length} Tracked)
                </CardTitle>
                <CardDescription className="text-xs">
                  Aapke business ki Google Maps top 3 ranking keywords. Naye keywords add ya change karein.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddForm(!showAddForm)}
                className="rounded-xl text-xs border-primary/40 text-primary hover:bg-primary/10 shrink-0 self-start sm:self-auto"
              >
                <Plus className="size-3.5 mr-1" />
                {showAddForm ? "Cancel" : "Add New Keyword"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Inline Add Keyword Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddKeyword}
                className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" /> Track New Local Keyword
                  </h4>
                  <span className="text-[10px] text-muted-foreground">Local 3-Pack SEO</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2 space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Keyword Query *</span>
                    <Input
                      placeholder="e.g. Best Photo Studio Near Me"
                      value={newKeywordText}
                      onChange={(e) => setNewKeywordText(e.target.value)}
                      required
                      className="text-xs rounded-xl bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Current Google Rank (#)</span>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={newRank}
                      onChange={(e) => setNewRank(e.target.value)}
                      className="text-xs rounded-xl bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Monthly Search Volume</span>
                    <Input
                      placeholder="e.g. 1.5k / mo"
                      value={newSearches}
                      onChange={(e) => setNewSearches(e.target.value)}
                      className="text-xs rounded-xl bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Trend Direction</span>
                    <select
                      value={newTrend}
                      onChange={(e) => setNewTrend(e.target.value as any)}
                      className="w-full h-9 rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="up">Trending Up (▲)</option>
                      <option value="steady">Steady (—)</option>
                      <option value="down">Trending Down (▼)</option>
                    </select>
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
                    className="rounded-xl text-xs bg-primary text-primary-foreground"
                  >
                    Save & Track Keyword
                  </Button>
                </div>
              </form>
            )}

            {/* Keywords List with Edit & Delete */}
            <div className="divide-y divide-border/40 text-xs">
              {keywords.map((kw) => {
                const isEditing = editingId === kw.id;

                if (isEditing) {
                  return (
                    <div key={kw.id} className="py-2.5 bg-muted/30 rounded-xl p-2.5 space-y-2 border border-primary/30">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <span className="text-[10px] text-muted-foreground">Keyword Query</span>
                          <Input
                            value={editKeywordText}
                            onChange={(e) => setEditKeywordText(e.target.value)}
                            className="text-xs rounded-xl bg-background"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground">Rank (#)</span>
                          <Input
                            type="number"
                            min={1}
                            max={50}
                            value={editRank}
                            onChange={(e) => setEditRank(e.target.value)}
                            className="text-xs rounded-xl bg-background"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="w-1/2">
                          <Input
                            placeholder="Monthly Searches (e.g. 1.2k / mo)"
                            value={editSearches}
                            onChange={(e) => setEditSearches(e.target.value)}
                            className="text-xs rounded-xl bg-background"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(kw.id)}
                            className="h-8 rounded-xl text-xs bg-primary text-primary-foreground px-3"
                          >
                            <Check className="size-3.5 mr-1" /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            className="h-8 rounded-xl text-xs px-2"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={kw.id} className="flex items-center justify-between py-2.5 group">
                    <div className="space-y-0.5 min-w-0 pr-4">
                      <p className="font-semibold text-foreground truncate">{kw.keyword}</p>
                      <p className="text-[10px] text-muted-foreground">{kw.searches}</p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={
                          kw.rank === 1
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-300 font-bold"
                            : kw.rank <= 3
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold"
                            : "border-primary/40 bg-primary/10 text-primary font-bold"
                        }
                      >
                        Rank #{kw.rank}
                      </Badge>

                      <span className="text-xs font-semibold">
                        {kw.trend === "up" && (
                          <span className="text-emerald-400 flex items-center">
                            <TrendingUp className="size-3.5" />
                          </span>
                        )}
                        {kw.trend === "down" && (
                          <span className="text-rose-400 flex items-center">
                            <TrendingDown className="size-3.5" />
                          </span>
                        )}
                        {kw.trend === "steady" && (
                          <span className="text-muted-foreground flex items-center">
                            <Minus className="size-3.5" />
                          </span>
                        )}
                      </span>

                      {/* Action buttons (Edit & Delete) */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleStartEdit(kw)}
                          className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Edit Keyword"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteKeyword(kw.id, kw.keyword)}
                          className="size-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete Keyword"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
