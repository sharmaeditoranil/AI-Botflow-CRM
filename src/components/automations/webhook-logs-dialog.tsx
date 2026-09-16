'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  History,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  FileJson,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WebhookTrigger, WebhookTriggerLog } from '@/types';

interface WebhookLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: WebhookTrigger | null;
}

export function WebhookLogsDialog({
  open,
  onOpenChange,
  trigger,
}: WebhookLogsDialogProps) {
  const [logs, setLogs] = useState<WebhookTriggerLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!trigger) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/webhook-triggers/${trigger.id}/logs?limit=50`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch logs');
      setLogs(data.logs || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load delivery logs');
    } finally {
      setLoading(false);
    }
  }, [trigger]);

  useEffect(() => {
    if (open && trigger) {
      fetchLogs();
      setExpandedId(null);
    }
  }, [open, trigger, fetchLogs]);

  if (!trigger) return null;

  function copyPayload(log: WebhookTriggerLog) {
    navigator.clipboard.writeText(JSON.stringify(log.request_payload, null, 2));
    setCopiedId(log.id);
    toast.success('Payload copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Webhook Logs: {trigger.name}</DialogTitle>
              <DialogDescription className="text-xs">
                Recent execution history, incoming payloads, and delivery statuses.
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-2">
          {loading && logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Loading delivery logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <FileJson className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No webhook hits recorded yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mt-0.5">
                  When your website, Shopify, or automation tool POSTs data to this bot&apos;s webhook URL, execution records will show up here.
                </p>
              </div>
            </div>
          ) : (
            logs.map((log) => {
              const isExpanded = expandedId === log.id;
              const isSuccess = log.status === 'success';

              return (
                <div
                  key={log.id}
                  className="rounded-lg border border-border bg-card/60 transition-colors overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isSuccess ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground font-mono">
                            {log.recipient_phone || 'No phone extracted'}
                          </span>
                          {log.recipient_name && (
                            <span className="text-xs text-muted-foreground truncate">
                              ({log.recipient_name})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(log.created_at).toLocaleString()}</span>
                          {log.execution_time_ms !== null && log.execution_time_ms !== undefined && (
                            <span>• {log.execution_time_ms} ms</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          isSuccess
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[11px]'
                            : 'bg-destructive/10 text-destructive border-destructive/20 text-[11px]'
                        }
                      >
                        {isSuccess ? 'Success (200)' : `Failed (${log.http_status})`}
                      </Badge>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3 text-xs">
                      {log.error_message && (
                        <div className="flex items-start gap-2 p-2.5 rounded border border-destructive/30 bg-destructive/10 text-destructive text-xs">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold block">Error:</span>
                            {log.error_message}
                          </div>
                        </div>
                      )}

                      {log.whatsapp_message_id && (
                        <div className="flex items-center justify-between text-[11px] bg-muted/50 p-2 rounded border border-border/50">
                          <span className="text-muted-foreground">WhatsApp Message ID:</span>
                          <span className="font-mono text-foreground font-medium">
                            {log.whatsapp_message_id}
                          </span>
                        </div>
                      )}

                      {/* Mapped Variables */}
                      {log.mapped_variables && Object.keys(log.mapped_variables).length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Substituted Variables Sent to Meta:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {Object.entries(log.mapped_variables).map(([key, val]) => (
                              <div
                                key={key}
                                className="flex items-center justify-between p-1.5 rounded bg-muted/40 border border-border/40 font-mono text-[11px]"
                              >
                                <span className="text-primary font-semibold">{`{{${key}}}`}</span>
                                <span className="truncate max-w-[180px] text-foreground">
                                  {val || '(empty)'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Raw Payload */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Received Payload (JSON):
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyPayload(log)}
                            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                          >
                            {copiedId === log.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            Copy JSON
                          </Button>
                        </div>
                        <pre className="p-2.5 rounded bg-muted/60 border border-border font-mono text-[11px] max-h-[180px] overflow-auto leading-relaxed text-foreground whitespace-pre-wrap break-all">
                          {JSON.stringify(log.request_payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
