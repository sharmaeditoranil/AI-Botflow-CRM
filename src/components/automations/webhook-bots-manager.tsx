'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Webhook,
  Plus,
  Play,
  History,
  Pencil,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WebhookBotDialog } from './webhook-bot-dialog';
import { WebhookTestDialog } from './webhook-test-dialog';
import { WebhookLogsDialog } from './webhook-logs-dialog';
import type { WebhookTrigger } from '@/types';

export function WebhookBotsManager() {
  const [triggers, setTriggers] = useState<WebhookTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dialog states
  const [botDialogOpen, setBotDialogOpen] = useState(false);
  const [selectedBot, setSelectedBot] = useState<WebhookTrigger | null>(null);

  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testBot, setTestBot] = useState<WebhookTrigger | null>(null);

  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [logsBot, setLogsBot] = useState<WebhookTrigger | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const loadTriggers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webhook-triggers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load triggers');
      setTriggers(data.triggers || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load webhook triggers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTriggers();
  }, [loadTriggers]);

  async function handleToggleActive(trigger: WebhookTrigger, nextActive: boolean) {
    try {
      const res = await fetch(`/api/webhook-triggers/${trigger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle status');

      setTriggers((prev) =>
        prev.map((t) => (t.id === trigger.id ? { ...t, is_active: nextActive } : t))
      );
      toast.success(nextActive ? 'Bot activated' : 'Bot paused');
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle status');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/webhook-triggers/${deleteId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete trigger');

      setTriggers((prev) => prev.filter((t) => t.id !== deleteId));
      toast.success('Webhook bot deleted');
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKeyId(null), 2000);
  }

  // Filtered triggers
  const filteredTriggers = triggers.filter((t) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      t.template_name.toLowerCase().includes(q)
    );
  });

  const totalRuns = triggers.reduce((acc, t) => acc + (t.execution_count || 0), 0);
  const activeCount = triggers.filter((t) => t.is_active).length;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            Incoming Webhook Bots
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect external apps (Shopify, WooCommerce, Zapier, Make) to trigger WhatsApp template messages automatically.
          </p>
        </div>

        <Button
          onClick={() => {
            setSelectedBot(null);
            setBotDialogOpen(true);
          }}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Create Webhook Bot
        </Button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Total Bots
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {triggers.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Active Bots
          </div>
          <div className="text-2xl font-bold text-emerald-500 mt-1">
            {activeCount}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl border border-border bg-card shadow-xs">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Total Triggers Executed
          </div>
          <div className="text-2xl font-bold text-primary mt-1">
            {totalRuns}
          </div>
        </div>
      </div>

      {/* Search Filter */}
      {triggers.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search webhook bots..."
            className="pl-9 text-xs bg-muted/40"
          />
        </div>
      )}

      {/* Bots Grid / List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-xs">Loading webhook triggers...</span>
        </div>
      ) : filteredTriggers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center bg-card/40">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <Webhook className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {triggers.length === 0 ? 'No incoming webhook bots yet' : 'No matching bots found'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            {triggers.length === 0
              ? 'Create a bot to get a unique webhook URL and secret key for external websites and automations.'
              : 'Try clearing your search query to see all webhook triggers.'}
          </p>
          {triggers.length === 0 && (
            <Button
              onClick={() => {
                setSelectedBot(null);
                setBotDialogOpen(true);
              }}
              className="gap-2 bg-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Create First Webhook Bot
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTriggers.map((trigger) => {
            const url = `${origin}/api/webhooks/incoming/${trigger.id}`;
            const isRevealed = revealedIds.has(trigger.id);
            const isCopiedUrl = copiedKeyId === `url-${trigger.id}`;
            const isCopiedSecret = copiedKeyId === `secret-${trigger.id}`;

            return (
              <div
                key={trigger.id}
                className="rounded-xl border border-border bg-card p-5 shadow-xs hover:border-border/80 transition-all space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
                      <Webhook className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {trigger.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={
                            trigger.is_active
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]'
                              : 'bg-muted text-muted-foreground text-[10px]'
                          }
                        >
                          {trigger.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      {trigger.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {trigger.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Active</span>
                      <Switch
                        checked={trigger.is_active}
                        onCheckedChange={(val) => handleToggleActive(trigger, val)}
                        aria-label="Toggle active"
                      />
                    </div>
                  </div>
                </div>

                {/* Details Row: Template & Mapping */}
                <div className="flex flex-wrap items-center gap-2 text-xs bg-muted/40 p-2.5 rounded-lg border border-border/60">
                  <span className="text-muted-foreground">Template:</span>
                  <Badge variant="secondary" className="font-mono text-[11px] bg-background">
                    {trigger.template_name} ({trigger.template_language})
                  </Badge>
                  <span className="text-muted-foreground ml-2">Phone:</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary text-[11px]">
                    {trigger.phone_path}
                  </code>
                  {trigger.name_path && (
                    <>
                      <span className="text-muted-foreground ml-1">Name:</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary text-[11px]">
                        {trigger.name_path}
                      </code>
                    </>
                  )}
                  {trigger.variable_mappings && Object.keys(trigger.variable_mappings).length > 0 && (
                    <span className="text-muted-foreground ml-2">
                      ({Object.keys(trigger.variable_mappings).length} variable mappings)
                    </span>
                  )}
                </div>

                {/* Webhook Connection Inputs (URL & Secret) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Webhook URL */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Unique Webhook URL
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        readOnly
                        value={url}
                        className="font-mono text-xs h-8 bg-muted/40 select-all"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(url, `url-${trigger.id}`)}
                        className="h-8 px-2.5 gap-1 text-xs shrink-0"
                      >
                        {isCopiedUrl ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy URL
                      </Button>
                    </div>
                  </div>

                  {/* Secret Key */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Secret Key (x-webhook-secret)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        readOnly
                        type={isRevealed ? 'text' : 'password'}
                        value={trigger.secret_key}
                        className="font-mono text-xs h-8 bg-muted/40 select-all"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleReveal(trigger.id)}
                        className="h-8 px-2 shrink-0"
                        title={isRevealed ? 'Hide' : 'Reveal'}
                      >
                        {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(trigger.secret_key, `secret-${trigger.id}`)}
                        className="h-8 px-2.5 gap-1 text-xs shrink-0"
                      >
                        {isCopiedSecret ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Footer Row: Metrics & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <strong>{trigger.execution_count || 0}</strong> runs
                    </span>
                    {trigger.last_triggered_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Last: {new Date(trigger.last_triggered_at).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTestBot(trigger);
                        setTestDialogOpen(true);
                      }}
                      className="h-8 gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Test Webhook
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLogsBot(trigger);
                        setLogsDialogOpen(true);
                      }}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <History className="h-3.5 w-3.5" />
                      Logs
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedBot(trigger);
                        setBotDialogOpen(true);
                      }}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(trigger.id)}
                      className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <WebhookBotDialog
        open={botDialogOpen}
        onOpenChange={setBotDialogOpen}
        initial={selectedBot}
        onSaved={loadTriggers}
      />

      <WebhookTestDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        trigger={testBot}
      />

      <WebhookLogsDialog
        open={logsDialogOpen}
        onOpenChange={setLogsDialogOpen}
        trigger={logsBot}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Webhook Bot?</DialogTitle>
            <DialogDescription className="text-xs">
              This will permanently delete this webhook trigger and all its delivery logs. External software calling this URL will receive 404 Not Found.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete Bot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
