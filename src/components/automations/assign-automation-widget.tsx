"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, Play, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";

interface AutomationOption {
  id: string;
  name: string;
  description?: string | null;
  trigger_type: string;
  is_active: boolean;
}

interface PendingExecution {
  id: string;
  automation_id: string;
  status: string;
  run_at?: string;
  automations?: {
    id: string;
    name: string;
  } | null;
}

interface AutomationLog {
  id: string;
  automation_id: string;
  status: "success" | "partial" | "failed";
  error_message?: string | null;
  created_at: string;
  steps_executed?: unknown[];
  automations?: {
    id: string;
    name: string;
  } | null;
}

interface AssignAutomationWidgetProps {
  contactId: string | null | undefined;
  conversationId?: string | null;
  className?: string;
}

export function AssignAutomationWidget({
  contactId,
  conversationId,
  className = "",
}: AssignAutomationWidgetProps) {
  const [automations, setAutomations] = useState<AutomationOption[]>([]);
  const [pendingRuns, setPendingRuns] = useState<PendingExecution[]>([]);
  const [recentLogs, setRecentLogs] = useState<AutomationLog[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/automations/assign?contactId=${encodeURIComponent(contactId)}`);
      const data = await res.json();
      if (res.ok) {
        setAutomations(data.automations || []);
        setPendingRuns(data.pending || []);
        setRecentLogs(data.recentLogs || []);
        if (!selectedAutomationId && (data.automations || []).length > 0) {
          setSelectedAutomationId(data.automations[0].id);
        }
      }
    } catch (err) {
      console.warn("[assign-automation-widget] Failed to load automations:", err);
    } finally {
      setLoading(false);
    }
  }, [contactId, selectedAutomationId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Check if the selected automation is already pending or running for this customer
  const isSelectedRunning = pendingRuns.some((p) => p.automation_id === selectedAutomationId);

  const handleAssign = async () => {
    if (!contactId) {
      toast.error("Contact is required to assign automation.");
      return;
    }
    if (!selectedAutomationId) {
      toast.error("Please select an automation.");
      return;
    }

    if (isSelectedRunning) {
      toast.error("This automation is already active for this customer.");
      return;
    }

    setAssigning(true);
    try {
      const res = await fetch("/api/automations/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          automationId: selectedAutomationId,
          conversationId: conversationId || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Automation assigned and started!");
        await loadStatus();
      } else {
        toast.error(data.error || "Failed to assign automation");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger automation");
    } finally {
      setAssigning(false);
    }
  };

  if (!contactId) return null;

  return (
    <div className={`space-y-2.5 rounded-xl border border-border/80 bg-card/60 p-3 shadow-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
            <Zap className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-foreground">
            Assign Automation
          </span>
        </div>
        {recentLogs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <History className="h-3 w-3" />
            {showHistory ? "Hide History" : `${recentLogs.length} recent`}
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Active / Scheduled Status Badges */}
      {pendingRuns.length > 0 && (
        <div className="space-y-1.5">
          {pendingRuns.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-500"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="truncate text-[11px] font-semibold">
                  {run.automations?.name || "Automation"}
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider shrink-0">
                {run.status === "running" ? "Running" : "Scheduled"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Selector & Run Button */}
      {automations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 p-2 text-center text-[11px] text-muted-foreground">
          {loading ? "Loading automations..." : "No active automations found in your account."}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <select
              value={selectedAutomationId}
              onChange={(e) => setSelectedAutomationId(e.target.value)}
              disabled={assigning}
              className="h-8 flex-1 rounded-lg border border-border/80 bg-background px-2 text-xs font-medium text-foreground outline-none focus:border-primary"
            >
              {automations.map((auto) => (
                <option key={auto.id} value={auto.id}>
                  {auto.name}
                </option>
              ))}
            </select>

            <Button
              type="button"
              size="sm"
              disabled={assigning || isSelectedRunning || !selectedAutomationId}
              onClick={handleAssign}
              className="h-8 px-2.5 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1 font-semibold shrink-0 cursor-pointer disabled:opacity-50"
              title={
                isSelectedRunning
                  ? "This automation is already active for this customer"
                  : "Start this automation for customer now"
              }
            >
              {assigning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3 fill-current" />
              )}
              Assign & Run
            </Button>
          </div>

          {/* Duplicate Safety Banner */}
          {isSelectedRunning && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-500">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Already active for this customer to prevent double execution.</span>
            </div>
          )}
        </div>
      )}

      {/* Recent History Accordion */}
      {showHistory && recentLogs.length > 0 && (
        <div className="pt-2 border-t border-border/60 space-y-1.5 max-h-40 overflow-y-auto pr-1">
          <span className="text-[10px] uppercase font-semibold text-muted-foreground">
            Recent Executions
          </span>
          {recentLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded border border-border/50 bg-muted/40 px-2 py-1 text-[11px]"
            >
              <div className="min-w-0 pr-1">
                <p className="truncate text-foreground font-medium">
                  {log.automations?.name || "Automation"}
                </p>
                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-2 w-2" />
                  {format(new Date(log.created_at), "MMM d, HH:mm")}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-semibold shrink-0 ${
                  log.status === "success"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : log.status === "failed"
                    ? "bg-rose-500/15 text-rose-500"
                    : "bg-amber-500/15 text-amber-500"
                }`}
              >
                {log.status === "success" ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : (
                  <XCircle className="h-2.5 w-2.5" />
                )}
                {log.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
