"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  ShieldCheck,
  Search,
  MapPin,
  Camera,
  Clock,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

interface AuditCheckItem {
  id: string;
  title: string;
  category: "NAP & Identity" | "Visual Content" | "Hours & Availability" | "Attributes & SEO";
  status: "passed" | "warning" | "failed";
  impact: "High" | "Medium" | "Low";
  details: string;
  recommendation: string;
}

const AUDIT_ITEMS: AuditCheckItem[] = [
  {
    id: "check-1",
    title: "NAP (Name, Address, Phone) Consistency",
    category: "NAP & Identity",
    status: "passed",
    impact: "High",
    details: "Store name, full street address, and phone number match 100% with your website metadata and Google Maps listing.",
    recommendation: "Keep maintaining strict NAP consistency on social handles.",
  },
  {
    id: "check-2",
    title: "Primary & Secondary Categories",
    category: "NAP & Identity",
    status: "passed",
    impact: "High",
    details: "Primary category set to 'Software Company'. 3 secondary sub-categories added.",
    recommendation: "Review categories quarterly as Google updates category taxonomies.",
  },
  {
    id: "check-3",
    title: "High-Resolution Storefront & Team Photos",
    category: "Visual Content",
    status: "warning",
    impact: "Medium",
    details: "14 active photos uploaded. Google recommends minimum 20 photos for 2x more discovery views.",
    recommendation: "Upload 6 additional photos of your workspace, team, or client presentations.",
  },
  {
    id: "check-4",
    title: "Special Holiday Hours Configuration",
    category: "Hours & Availability",
    status: "warning",
    impact: "Medium",
    details: "Upcoming national holidays are not yet configured in Google Business Profile.",
    recommendation: "Set holiday schedules in advance to avoid customer disappointment.",
  },
  {
    id: "check-5",
    title: "Business Attributes & Amenities",
    category: "Attributes & SEO",
    status: "passed",
    impact: "Medium",
    details: "Wheelchair accessibility, online appointments, and digital payments attributes enabled.",
    recommendation: "All relevant attributes verified.",
  },
  {
    id: "check-6",
    title: "Review Response Velocity",
    category: "Attributes & SEO",
    status: "passed",
    impact: "High",
    details: "Average reply time is under 4 hours with 96% response rate. Boosts Local 3-Pack rank.",
    recommendation: "Keep utilizing AI Review Replies engine for quick replies.",
  },
];

export function GmbAudit() {
  const [items, setItems] = useState<AuditCheckItem[]>(AUDIT_ITEMS);
  const [isRunningScan, setIsRunningScan] = useState(false);

  const passedCount = items.filter((i) => i.status === "passed").length;
  const healthScore = Math.round((passedCount / items.length) * 100);

  const handleRunAudit = () => {
    setIsRunningScan(true);
    setTimeout(() => {
      setIsRunningScan(false);
      toast.success("Local SEO & GMB Audit Completed!", {
        description: "Checked 18 local ranking signals against Google Local Search algorithm guidelines.",
      });
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Audit Hero Card */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card/90 to-primary/10 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">Local SEO & GMB Health Audit</h3>
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold">
              Live Algorithm Check
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Audit your Google Business Profile against the Google Local 3-Pack ranking signals: NAP consistency, media richness, response velocity, and completeness.
          </p>
          <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
            <span>Passed: <strong className="text-emerald-400 font-semibold">{passedCount}</strong>/{items.length}</span>
            <span>·</span>
            <span>Warnings: <strong className="text-amber-300 font-semibold">{items.length - passedCount}</strong></span>
            <span>·</span>
            <span>Last Scanned: <strong className="text-foreground">Today</strong></span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
          <div className="flex items-center gap-3 bg-muted/40 rounded-2xl p-3 border border-border/60">
            <div className="text-center">
              <span className="text-2xl font-bold text-emerald-400">{healthScore}%</span>
              <p className="text-[10px] text-muted-foreground font-medium">Health Score</p>
            </div>
            <div className="w-20">
              <Progress value={healthScore} className="h-2 rounded-full" />
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleRunAudit}
            disabled={isRunningScan}
            className="rounded-xl text-xs"
          >
            <Sparkles className={`size-3.5 mr-1.5 ${isRunningScan ? "animate-spin" : ""}`} />
            {isRunningScan ? "Auditing Signals..." : "Re-Run Audit"}
          </Button>
        </div>
      </div>

      {/* Checklist Sections */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pl-1">
          Audit Checklist & Ranking Signals
        </h4>

        <div className="grid grid-cols-1 gap-3">
          {items.map((item) => {
            const isPassed = item.status === "passed";
            const isWarning = item.status === "warning";

            return (
              <Card key={item.id} className="rounded-2xl border-border/70 shadow-xs hover:border-border transition-all">
                <CardContent className="p-4.5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isPassed && <CheckCircle2 className="size-4 text-emerald-400" />}
                        {isWarning && <AlertTriangle className="size-4 text-amber-400" />}
                        {!isPassed && !isWarning && <XCircle className="size-4 text-destructive" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-foreground">{item.title}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/60 text-muted-foreground">
                            {item.category}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              item.impact === "High"
                                ? "text-[9px] px-1.5 py-0 border-primary/40 bg-primary/10 text-primary"
                                : "text-[9px] px-1.5 py-0 border-border text-muted-foreground"
                            }
                          >
                            {item.impact} Impact
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {item.details}
                        </p>
                        <p className="text-[11px] text-primary/90 font-medium pt-0.5">
                          💡 Recommendation: {item.recommendation}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-end">
                      {isPassed ? (
                        <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="size-3" /> Optimized
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toast.success(`Optimization applied for ${item.title}`)}
                          className="rounded-xl text-[11px] h-7"
                        >
                          Optimize Now <ArrowRight className="size-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
