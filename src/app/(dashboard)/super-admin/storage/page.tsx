'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  HardDrive,
  Trash2,
  Save,
  Loader2,
  RefreshCw,
  Clock,
  Database,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Layers,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface StorageSettings {
  auto_cleanup_enabled: boolean;
  retention_media_days: number;
  retention_logs_days: number;
  retention_messages_days: number;
  clean_storage_files: boolean;
  clean_automation_logs: boolean;
  clean_inactive_runs: boolean;
  last_cleanup_at: string | null;
  last_cleanup_stats: {
    files_deleted: number;
    bytes_freed: number;
    log_rows_deleted: number;
    messages_deleted: number;
    executed_at: string;
    duration_ms: number;
    status: 'success' | 'partial' | 'error';
    summary: string;
    details?: {
      chatMediaFiles: number;
      flowMediaFiles: number;
      webhookLogs: number;
      automationLogs: number;
      flowEvents: number;
      flowRuns: number;
      aiLogs: number;
    };
  } | null;
}

export default function StorageManagementPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaningNow, setCleaningNow] = useState(false);
  const [form, setForm] = useState<StorageSettings>({
    auto_cleanup_enabled: true,
    retention_media_days: 30,
    retention_logs_days: 30,
    retention_messages_days: 0,
    clean_storage_files: true,
    clean_automation_logs: true,
    clean_inactive_runs: true,
    last_cleanup_at: null,
    last_cleanup_stats: null,
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/super-admin/storage/cleanup');
      const data = await res.json();
      if (res.ok && data.settings) {
        setForm(data.settings);
      } else {
        toast.error(data.error || 'Failed to fetch storage settings.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error loading storage settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch('/api/super-admin/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Storage retention policy saved successfully!');
        if (data.settings) {
          setForm(data.settings);
        }
      } else {
        toast.error(data.error || 'Failed to save retention policy.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving retention policy.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    const confirmed = window.confirm(
      `Clean up storage now?\n\nThis will scan and permanently purge:\n• Media files older than ${form.retention_media_days} days\n• Webhook & Automation logs older than ${form.retention_logs_days} days${
        form.retention_messages_days > 0
          ? `\n• Messages older than ${form.retention_messages_days} days`
          : ''
      }\n\nDo you want to proceed?`
    );

    if (!confirmed) return;

    try {
      setCleaningNow(true);
      const res = await fetch('/api/super-admin/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_now' }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Storage cleanup executed successfully!');
        await fetchSettings();
      } else {
        toast.error(data.error || 'Failed to execute storage cleanup.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error executing storage cleanup.');
    } finally {
      setCleaningNow(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lastRunStats = form.last_cleanup_stats;
  const mbFreed = lastRunStats
    ? (lastRunStats.bytes_freed / (1024 * 1024)).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6">
      {/* Top Banner / Metrics Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Auto-Cleanup Policy</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">
                  {form.auto_cleanup_enabled ? 'Active (Every 24h)' : 'Paused'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {form.auto_cleanup_enabled
                  ? 'Cleans background storage automatically'
                  : 'Manual execution only'}
              </p>
            </div>
            <div
              className={`flex size-10 items-center justify-center rounded-xl ${
                form.auto_cleanup_enabled
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              <Zap className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Last Cleaned</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">
                  {form.last_cleanup_at
                    ? new Date(form.last_cleanup_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Not yet run'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {lastRunStats ? `${lastRunStats.duration_ms}ms runtime` : 'Awaiting first sweep'}
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Disk Space Freed</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">{mbFreed} MB</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {lastRunStats ? `${lastRunStats.files_deleted} media files deleted` : 'No files deleted yet'}
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
              <HardDrive className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Log Records Purged</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">
                  {lastRunStats ? lastRunStats.log_rows_deleted.toLocaleString() : '0'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Webhooks, automations & AI logs
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
              <Database className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <HardDrive className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    Automatic Data Retention & Storage Policy
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Control how long user inputs, media attachments, and heavy logs are retained before being deleted automatically in the background.
                  </CardDescription>
                </div>
              </div>

              {/* Master Auto-Cleanup Toggle */}
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2">
                <div className="text-right">
                  <span className="text-xs font-semibold text-foreground block">
                    Auto-Delete in Background
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {form.auto_cleanup_enabled ? 'Runs every 24 hours' : 'Disabled'}
                  </span>
                </div>
                <Switch
                  checked={form.auto_cleanup_enabled}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, auto_cleanup_enabled: checked })
                  }
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 text-xs">
            {/* Retention Periods Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Media Retention */}
              <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-emerald-400" />
                  <Label className="font-semibold text-foreground text-xs">
                    Media & File Storage Retention
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Voice notes, inbound videos, customer photos, and PDFs stored in Supabase buckets (<code>chat-media</code> & <code>flow-media</code>).
                </p>
                <div className="pt-2">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Keep files for the last:
                  </Label>
                  <select
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.retention_media_days}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        retention_media_days: Number(e.target.value),
                      })
                    }
                  >
                    <option value={7}>7 Days (Aggressive space saving)</option>
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days (Recommended)</option>
                    <option value={60}>60 Days</option>
                    <option value={90}>90 Days (Quarterly)</option>
                    <option value={180}>180 Days (Half Year)</option>
                    <option value={365}>365 Days (1 Year)</option>
                  </select>
                </div>
              </div>

              {/* Logs Retention */}
              <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-blue-400" />
                  <Label className="font-semibold text-foreground text-xs">
                    Database & Webhook Logs Retention
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Incoming webhook JSON payloads (<code>webhook_trigger_logs</code>), automation executions (<code>automation_logs</code>), and AI usage history.
                </p>
                <div className="pt-2">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Keep logs for the last:
                  </Label>
                  <select
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.retention_logs_days}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        retention_logs_days: Number(e.target.value),
                      })
                    }
                  >
                    <option value={7}>7 Days</option>
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days (Recommended)</option>
                    <option value={60}>60 Days</option>
                    <option value={90}>90 Days</option>
                  </select>
                </div>
              </div>

              {/* Messages Retention (Optional) */}
              <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-purple-400" />
                  <Label className="font-semibold text-foreground text-xs">
                    Chat Messages Retention (Optional)
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Text chat conversation history in WhatsApp inbox. Keep forever is recommended so conversation history stays intact.
                </p>
                <div className="pt-2">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Message retention:
                  </Label>
                  <select
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.retention_messages_days}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        retention_messages_days: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0}>Keep Forever (Recommended - Never delete)</option>
                    <option value={30}>Delete messages older than 30 Days</option>
                    <option value={60}>Delete messages older than 60 Days</option>
                    <option value={90}>Delete messages older than 90 Days</option>
                    <option value={180}>Delete messages older than 180 Days</option>
                    <option value={365}>Delete messages older than 365 Days</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Granular Scope Checkboxes */}
            <div className="rounded-xl border border-border/70 bg-muted/10 p-4 space-y-3">
              <span className="font-semibold text-foreground text-xs block">
                Cleanup Target Modules
              </span>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={form.clean_storage_files}
                    onChange={(e) =>
                      setForm({ ...form, clean_storage_files: e.target.checked })
                    }
                    className="size-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>
                    Storage Files (<code>chat-media</code> & <code>flow-media</code>)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={form.clean_automation_logs}
                    onChange={(e) =>
                      setForm({ ...form, clean_automation_logs: e.target.checked })
                    }
                    className="size-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>
                    Automation & Webhook Execution Logs
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={form.clean_inactive_runs}
                    onChange={(e) =>
                      setForm({ ...form, clean_inactive_runs: e.target.checked })
                    }
                    className="size-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>
                    Finished & Stale Flow Run Events
                  </span>
                </label>
              </div>
            </div>

            {/* Save Buttons & Status */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-muted-foreground">
                Settings are saved globally across the platform. Background cleanup executes automatically every 24 hours.
              </span>
              <Button
                type="submit"
                disabled={saving}
                className="bg-primary text-primary-foreground font-semibold px-5"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" /> Save Retention Policy
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Manual Immediate Cleanup Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-400" />
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Instant Storage Cleanup
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Need to free up server or cloud storage immediately? Run the cleanup cycle on-demand based on your active retention rules without waiting for the nightly cron job.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <div className="space-y-1">
              <span className="font-semibold text-rose-300 text-xs block">
                Immediate Execution
              </span>
              <span className="text-[11px] text-muted-foreground block max-w-xl">
                Scans all account folders in <code>chat-media</code> and <code>flow-media</code>, removes files older than {form.retention_media_days} days, and purges database execution logs older than {form.retention_logs_days} days.
              </span>
            </div>

            <Button
              type="button"
              onClick={handleRunNow}
              disabled={cleaningNow}
              variant="outline"
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/20 shrink-0 font-semibold"
            >
              {cleaningNow ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-rose-400" />
                  Cleaning Storage...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 text-rose-400" />
                  Clean Up Storage Now
                </>
              )}
            </Button>
          </div>

          {/* Last Run Breakdown */}
          {lastRunStats && (
            <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-xs flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  Latest Cleanup Result:
                </span>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                  {lastRunStats.status.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-foreground font-medium">
                {lastRunStats.summary}
              </p>
              {lastRunStats.details && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] text-muted-foreground">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <span className="block text-[10px] uppercase font-semibold">Chat Media Files</span>
                    <span className="text-sm font-bold text-foreground">{lastRunStats.details.chatMediaFiles || 0}</span>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <span className="block text-[10px] uppercase font-semibold">Webhook Payload Logs</span>
                    <span className="text-sm font-bold text-foreground">{lastRunStats.details.webhookLogs || 0}</span>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <span className="block text-[10px] uppercase font-semibold">Automation Logs</span>
                    <span className="text-sm font-bold text-foreground">{lastRunStats.details.automationLogs || 0}</span>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <span className="block text-[10px] uppercase font-semibold">Flow Run Events</span>
                    <span className="text-sm font-bold text-foreground">{(lastRunStats.details.flowEvents || 0) + (lastRunStats.details.flowRuns || 0)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
