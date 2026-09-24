"use client";

import Link from "next/link";
import type { Deal, PipelineStage } from "@/types";
import { Calendar, Check, X, MessageSquare, Bot, Clock, Phone } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

export function DealCard({ deal, stage, onEdit, isOverlay }: DealCardProps) {
  const t = useTranslations("Pipelines.card");
  const contactLabel = deal.contact?.name || deal.contact?.phone || t("noContact");
  const assigneeLabel = deal.assignee?.full_name || null;

  const todayStr = new Date().toISOString().split("T")[0];
  const isOverdue = !!(deal.expected_close_date && deal.expected_close_date < todayStr && deal.status === "open");
  const isDueToday = !!(deal.expected_close_date && deal.expected_close_date === todayStr && deal.status === "open");

  const rawNotes = deal.notes || "";
  const followUpCount = (rawNotes.match(/\[Follow-up/gi) || []).length;

  let lastSnippet = "";
  if (rawNotes.trim()) {
    const lines = rawNotes.split(/\n+/).filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      lastSnippet = lastLine.replace(/^\[[^\]]+\]:\s*/, "");
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      className={`group relative w-full cursor-pointer rounded-xl border border-border/50 bg-muted/70 pl-4 pr-3 py-3 text-left shadow-sm transition-all ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-lg"
      }`}
    >
      {/* 4px left accent bar using stage color */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
      />

      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-sm font-semibold leading-snug text-foreground break-words">
          {deal.title}
        </h4>
        {deal.status === "won" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" />
            {t("won")}
          </span>
        )}
        {deal.status === "lost" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <X className="h-3 w-3" />
            {t("lost")}
          </span>
        )}
      </div>

      {/* Contact row */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
            {initials(deal.contact?.name, deal.contact?.phone)}
          </span>
          <span className="truncate text-xs text-muted-foreground font-medium">{contactLabel}</span>
        </div>
        {deal.contact_id && !deal.contact?.phone && (
          <Link
            href={`/inbox?contactId=${deal.contact_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
            title="Open WhatsApp chat in Inbox"
          >
            <MessageSquare className="h-2.5 w-2.5" />
            Chat
          </Link>
        )}
      </div>

      {/* Customer Mobile Number Box */}
      {deal.contact?.phone && (
        <div className="mt-2 flex items-center justify-between gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1.5 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Phone className="h-3 w-3 text-emerald-500 shrink-0" />
            <span className="font-mono text-[11px] font-semibold text-foreground truncate">
              {deal.contact.phone}
            </span>
          </div>
          {deal.contact_id && (
            <Link
              href={`/inbox?contactId=${deal.contact_id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 text-[10px] font-semibold transition-colors shadow-xs"
              title="Open WhatsApp chat with this customer"
            >
              <MessageSquare className="h-2.5 w-2.5" />
              <span>Chat</span>
            </Link>
          )}
        </div>
      )}

      {/* Value & Due Date status */}
      <div className="mt-2 flex items-center justify-between gap-1">
        {typeof deal.value === "number" && deal.value > 0 ? (
          <span className="text-sm font-bold text-primary">
            {formatCurrency(deal.value, deal.currency)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/80 italic font-normal">
            No value set
          </span>
        )}
        {isOverdue && deal.expected_close_date ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
            <Clock className="h-2.5 w-2.5" />
            Overdue
          </span>
        ) : isDueToday ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
            🔔 Due Today
          </span>
        ) : deal.expected_close_date ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(deal.expected_close_date)}
          </span>
        ) : null}
      </div>

      {/* Follow-up count and latest note snippet preview */}
      {(followUpCount > 0 || lastSnippet) && (
        <div className="mt-2 rounded-md bg-background/60 border border-border/40 p-1.5 text-[11px] space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            {followUpCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                🔄 {followUpCount} Follow-up{followUpCount > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-muted-foreground font-medium">Latest Note</span>
            )}
          </div>
          {lastSnippet && (
            <p className="line-clamp-1 text-muted-foreground text-[10.5px] italic">
              &ldquo;{lastSnippet}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Quick Action Footer: AI Follow-up & Assignee */}
      <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between">
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              toast.info("Sending AI follow-up message...");
              const res = await fetch("/api/crm/ai-followup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dealId: deal.id }),
              });
              const data = await res.json();
              if (res.ok && data.processed > 0) {
                toast.success("AI Follow-up message sent on WhatsApp!");
              } else {
                toast.info("Follow-up checked.");
              }
            } catch (err: any) {
              toast.error("Failed to send AI follow-up");
            }
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors cursor-pointer"
          title="Send AI personalized follow-up message"
        >
          <Bot className="h-3 w-3" />
          AI Follow-up
        </button>

        {assigneeLabel && (
          <span
            title={assigneeLabel}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(assigneeLabel)}
          </span>
        )}
      </div>
    </button>
  );
}
