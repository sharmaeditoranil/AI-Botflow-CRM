'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Code2,
  Smartphone,
  User,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { WebhookTrigger } from '@/types';

interface WebhookTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: WebhookTrigger | null;
}

/** Set a nested value in an object given a dot-path */
function setPathValue(obj: Record<string, unknown>, path: string, value: unknown) {
  if (!path) return;
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: any = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    if (!cur[key] || typeof cur[key] !== 'object') {
      cur[key] = {};
    }
    cur = cur[key];
  }
  if (tokens.length > 0) {
    cur[tokens[tokens.length - 1]] = value;
  }
}

/** Pre-populate a realistic JSON payload from the trigger's mappings */
function buildSamplePayload(trigger: WebhookTrigger): string {
  const root: Record<string, unknown> = {};

  // Phone path
  setPathValue(root, trigger.phone_path || 'phone', '+919876543210');

  // Name path
  if (trigger.name_path) {
    setPathValue(root, trigger.name_path, 'Anil Sharma');
  }

  // Variable mappings
  if (trigger.variable_mappings) {
    Object.entries(trigger.variable_mappings).forEach(([idx, pathOrStatic]) => {
      if (!pathOrStatic) return;
      if (pathOrStatic.startsWith('static:')) return;
      setPathValue(root, pathOrStatic, `Sample Value ${idx}`);
    });
  }

  return JSON.stringify(root, null, 2);
}

export function WebhookTestDialog({
  open,
  onOpenChange,
  trigger,
}: WebhookTestDialogProps) {
  const [jsonPayload, setJsonPayload] = useState('');
  const [overridePhone, setOverridePhone] = useState('');
  const [testingExtract, setTestingExtract] = useState(false);
  const [testingSend, setTestingSend] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [sendResult, setSendResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (trigger && open) {
      setJsonPayload(buildSamplePayload(trigger));
      setExtractionResult(null);
      setSendResult(null);
      setErrorMessage(null);
      setOverridePhone('');
    }
  }, [trigger, open]);

  if (!trigger) return null;

  async function handleTestExtraction() {
    setTestingExtract(true);
    setErrorMessage(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonPayload);
      } catch {
        setErrorMessage('Invalid JSON format. Please check your JSON syntax.');
        setTestingExtract(false);
        return;
      }

      const res = await fetch(`/api/webhook-triggers/${trigger?.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'extract',
          payload: parsed,
          override_phone: overridePhone || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract payload');
      }

      setExtractionResult(data.extracted);
      toast.success('Payload mapping verified successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Extraction failed');
      toast.error(err.message || 'Extraction failed');
    } finally {
      setTestingExtract(false);
    }
  }

  async function handleLiveSend() {
    setTestingSend(true);
    setErrorMessage(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonPayload);
      } catch {
        setErrorMessage('Invalid JSON format. Please check your JSON syntax.');
        setTestingSend(false);
        return;
      }

      const res = await fetch(`/api/webhook-triggers/${trigger?.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'send',
          payload: parsed,
          override_phone: overridePhone || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Live test failed');
      }

      setSendResult(data.data);
      toast.success('WhatsApp template delivered successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Send failed');
      toast.error(err.message || 'WhatsApp message send failed');
    } finally {
      setTestingSend(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Play className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Test Webhook Trigger: {trigger.name}</DialogTitle>
              <DialogDescription>
                Simulate an incoming webhook hit to verify phone extraction, variable mapping, or send a live test message.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Active template badge */}
          <div className="flex flex-wrap items-center gap-2 text-xs bg-muted/60 p-3 rounded-lg border border-border">
            <span className="text-muted-foreground">Target Template:</span>
            <Badge variant="outline" className="font-mono bg-background">
              {trigger.template_name} ({trigger.template_language})
            </Badge>
            <span className="text-muted-foreground ml-2">Phone Path:</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-primary">
              {trigger.phone_path}
            </code>
            {trigger.name_path && (
              <>
                <span className="text-muted-foreground ml-2">Name Path:</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-primary">
                  {trigger.name_path}
                </code>
              </>
            )}
          </div>

          {/* Payload input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                Sample Incoming JSON Payload
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setJsonPayload(buildSamplePayload(trigger))}
              >
                Reset to default sample
              </Button>
            </div>
            <Textarea
              value={jsonPayload}
              onChange={(e) => setJsonPayload(e.target.value)}
              className="font-mono text-xs bg-muted/40 min-h-[160px] leading-relaxed"
              placeholder="{}"
            />
          </div>

          {/* Recipient Phone override */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              Test Recipient Phone (Optional Override)
            </Label>
            <Input
              value={overridePhone}
              onChange={(e) => setOverridePhone(e.target.value)}
              placeholder="Leave empty to use phone from payload, or enter e.g. +919876543210"
              className="font-mono text-xs bg-muted/30"
            />
            <p className="text-[11px] text-muted-foreground">
              Tip: When running a live send, you can enter your personal phone number to test WhatsApp delivery safely.
            </p>
          </div>

          {/* Error display */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Extraction preview result */}
          {extractionResult && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Extraction Preview (Dry Run)
                </span>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                  Ready to send
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 p-2 rounded border border-border/60">
                  <span className="text-muted-foreground block text-[11px]">Extracted Phone:</span>
                  <span className="font-mono font-medium text-foreground">
                    {extractionResult.phone || <span className="text-destructive">None found</span>}
                  </span>
                </div>
                <div className="bg-muted/50 p-2 rounded border border-border/60">
                  <span className="text-muted-foreground block text-[11px]">Extracted Name:</span>
                  <span className="font-medium text-foreground">
                    {extractionResult.name || <span className="text-muted-foreground">None</span>}
                  </span>
                </div>
              </div>

              {/* Parameters table */}
              {extractionResult.params && extractionResult.params.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">Mapped Template Variables:</span>
                  <div className="rounded border border-border divide-y divide-border text-xs">
                    {extractionResult.params.map((val: string, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/20">
                        <span className="font-mono font-medium text-primary">
                          {`{{${i + 1}}}`}
                        </span>
                        <span className="font-mono text-foreground font-medium truncate max-w-[280px]">
                          {val || <span className="text-muted-foreground italic">(empty string)</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live send result */}
          {sendResult && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Live WhatsApp Message Sent Successfully!
              </div>
              <div className="text-xs space-y-1 text-foreground/90 font-mono">
                <div>Recipient: <span className="font-medium">{sendResult.recipient}</span></div>
                <div>WhatsApp Message ID: <span className="text-xs text-muted-foreground">{sendResult.whatsappMessageId}</span></div>
                <div>Execution Time: <span>{sendResult.executionTimeMs} ms</span></div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={testingExtract || testingSend}
              onClick={handleTestExtraction}
              className="gap-1.5"
            >
              {testingExtract ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Code2 className="h-4 w-4" />
              )}
              Test Mapping
            </Button>
            <Button
              type="button"
              disabled={testingExtract || testingSend}
              onClick={handleLiveSend}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {testingSend ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Live Test Message
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
