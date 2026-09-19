"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  Search,
  MapPin,
  PhoneCall,
  Globe,
  Navigation,
  Sparkles,
  ArrowUpRight,
  Eye,
  MessageSquare,
} from "lucide-react";

export function GmbGrowthScore() {
  const growthScore = 89;

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
      period: "clicks to aibotflow.in",
      icon: Globe,
      color: "text-amber-400",
    },
  ];

  const topKeywords = [
    { keyword: "WhatsApp CRM software Noida", rank: 1, searches: "1.2k / mo", trend: "up" },
    { keyword: "AI WhatsApp marketing agency", rank: 2, searches: "2.4k / mo", trend: "up" },
    { keyword: "Meta Cloud API CRM India", rank: 3, searches: "950 / mo", trend: "steady" },
    { keyword: "Customer support WhatsApp automation", rank: 2, searches: "1.8k / mo", trend: "up" },
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
              How customers discover your business
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
                Searched specifically for &apos;Aibotflow&apos;.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Local 3-Pack Keywords Tracker */}
        <Card className="lg:col-span-2 rounded-2xl border-border/70 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="size-4 text-primary" />
                  Google Local 3-Pack Keyword Rankings
                </CardTitle>
                <CardDescription className="text-xs">
                  Your business position in Google Maps top 3 search results
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                Live Rank
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/40 text-xs">
              {topKeywords.map((kw, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div className="space-y-0.5 min-w-0 pr-4">
                    <p className="font-semibold text-foreground truncate">{kw.keyword}</p>
                    <p className="text-[10px] text-muted-foreground">{kw.searches}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge
                      variant="outline"
                      className={
                        kw.rank === 1
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300 font-bold"
                          : "border-primary/40 bg-primary/10 text-primary font-bold"
                      }
                    >
                      Rank #{kw.rank}
                    </Badge>
                    <span className="text-xs text-emerald-400 font-semibold">
                      <TrendingUp className="size-3.5 inline" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
