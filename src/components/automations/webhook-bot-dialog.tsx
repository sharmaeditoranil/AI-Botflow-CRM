'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Webhook,
  Sparkles,
  Copy,
  Check,
  RotateCw,
  Eye,
  EyeOff,
  Code2,
  FileText,
  AlertCircle,
  Loader2,
  HelpCircle,
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import type { MessageTemplate, WebhookTrigger } from '@/types';

interface WebhookBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: WebhookTrigger | null;
  onSaved: (trigger: WebhookTrigger) => void;
}

export function WebhookBotDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: WebhookBotDialogProps) {
  const isEditing = Boolean(initial);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [phonePath, setPhonePath] = useState('phone');
  const [namePath, setNamePath] = useState('name');
  const [variableMappings, setVariableMappings] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);

  // Secret display for existing bots
  const [secretKey, setSecretKey] = useState('');
  const [revealSecret, setRevealSecret] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load approved templates
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTemplates(true);

    const supabase = createClient();
    supabase
      .from('message_templates')
      .select('*')
      .eq('status', 'APPROVED')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load templates:', error);
          toast.error('Failed to load approved templates');
        } else {
          setTemplates(data || []);
        }
        setLoadingTemplates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Populate initial values when dialog opens
  useEffect(() => {
    if (initial && open) {
      setName(initial.name || '');
      setDescription(initial.description || '');
      setTemplateKey(`${initial.template_name}::${initial.template_language || 'en'}`);
      setPhonePath(initial.phone_path || 'phone');
      setNamePath(initial.name_path || 'name');
      setVariableMappings(initial.variable_mappings || {});
      setIsActive(initial.is_active !== false);
      setSecretKey(initial.secret_key || '');
    } else if (open) {
      setName('');
      setDescription('');
      setTemplateKey('');
      setPhonePath('phone');
      setNamePath('name');
      setVariableMappings({});
      setIsActive(true);
      setSecretKey('');
    }
    setRevealSecret(false);
  }, [initial, open]);

  // Find currently selected template
  const selectedTemplate = useMemo(() => {
    if (!templateKey) return null;
    const [tName, tLang] = templateKey.split('::');
    return (
      templates.find(
        (t) => t.name === tName && (t.language || 'en') === (tLang || 'en')
      ) || null
    );
  }, [templateKey, templates]);

  // Auto-detect variable indices in the selected template's body text
  const detectedVariableIndices = useMemo(() => {
    if (!selectedTemplate?.body_text) return [];
    return extractVariableIndices(selectedTemplate.body_text);
  }, [selectedTemplate]);

  // Origin for generating full URL
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = initial
    ? `${origin}/api/webhooks/incoming/${initial.id}`
    : `${origin}/api/webhooks/incoming/<generated_id>`;

  const curlExample = initial
    ? `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: ${secretKey}" \\
  -d '{"${phonePath}": "+919876543210"}'`
    : '';

  async function handleRegenerateSecret() {
    if (!initial) return;
    if (
      !confirm(
        'Are you sure you want to regenerate the secret key? External applications using the old key will be rejected until updated.'
      )
    ) {
      return;
    }

    setRegeneratingSecret(true);
    try {
      const res = await fetch(
        `/api/webhook-triggers/${initial.id}/regenerate-secret`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate secret');
      setSecretKey(data.secret_key);
      toast.success('Secret key regenerated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to regenerate secret');
    } finally {
      setRegeneratingSecret(false);
    }
  }

  function handleCopy(text: string, type: 'url' | 'secret' | 'curl') {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else if (type === 'secret') {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    }
    toast.success('Copied to clipboard');
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Bot name is required');
      return;
    }
    if (!templateKey) {
      toast.error('Please select an approved WhatsApp template');
      return;
    }
    if (!phonePath.trim()) {
      toast.error('Recipient phone path is required');
      return;
    }

    const [templateName, templateLanguage] = templateKey.split('::');

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        template_name: templateName,
        template_language: templateLanguage || 'en',
        phone_path: phonePath.trim(),
        name_path: namePath.trim() || null,
        variable_mappings: variableMappings,
        is_active: isActive,
      };

      const url = initial
        ? `/api/webhook-triggers/${initial.id}`
        : '/api/webhook-triggers';

      const res = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save bot trigger');

      toast.success(
        initial ? 'Webhook bot updated successfully' : 'Webhook bot created successfully'
      );
      onSaved(data.trigger);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Webhook className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>
                {isEditing ? `Edit Webhook Bot: ${initial?.name}` : 'Create Incoming Webhook Bot'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Trigger automatic WhatsApp template sends whenever external software (Shopify, Zapier, Make, etc.) POSTs to your unique URL.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section 1: Bot Basics */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              1. Bot Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Bot Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Shopify Order Confirmation, Website Lead Form"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <div className="flex items-center justify-between p-2 rounded-lg border border-border bg-muted/30">
                  <span className="text-xs font-medium">Bot Active</span>
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    aria-label="Bot Active"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Description (Optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief note on what this webhook trigger is used for"
                className="text-xs"
              />
            </div>
          </div>

          {/* Section 2: WhatsApp Template Selection */}
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              2. Select WhatsApp Approved Template
            </h3>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Approved Template *</Label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Loading WhatsApp templates...
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    No approved WhatsApp templates found. Go to <strong>Settings → Templates</strong> to sync or create templates approved by Meta.
                  </div>
                </div>
              ) : (
                <select
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">-- Choose an approved WhatsApp template --</option>
                  {templates.map((tpl) => (
                    <option
                      key={`${tpl.name}::${tpl.language || 'en'}`}
                      value={`${tpl.name}::${tpl.language || 'en'}`}
                    >
                      {tpl.name} ({tpl.language || 'en'}) — {tpl.category}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Template Preview Card */}
            {selectedTemplate && (
              <div className="rounded-lg border border-border bg-card p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    Preview: {selectedTemplate.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {selectedTemplate.language} • {selectedTemplate.category}
                  </Badge>
                </div>
                <div className="bg-muted/60 p-3 rounded border border-border/50 text-xs font-sans whitespace-pre-wrap leading-relaxed">
                  {selectedTemplate.body_text}
                </div>
                {detectedVariableIndices.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Detected variables: {detectedVariableIndices.map((i) => `{{${i}}}`).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Incoming Data Mapping */}
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-primary" />
              3. Incoming Payload Field Mapping
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  Recipient Phone JSON Path *
                  <HelpCircle className="h-3 w-3 text-muted-foreground" title="Path in incoming JSON containing phone number (e.g. phone, customer.mobile)" />
                </Label>
                <Input
                  value={phonePath}
                  onChange={(e) => setPhonePath(e.target.value)}
                  placeholder="e.g. phone, customer.mobile, data.phone"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Dot notation supported (e.g. <code>customer.phone</code>).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  Contact Name JSON Path (Optional)
                </Label>
                <Input
                  value={namePath}
                  onChange={(e) => setNamePath(e.target.value)}
                  placeholder="e.g. name, customer.name, first_name"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Stores recipient's name in CRM contact record.
                </p>
              </div>
            </div>

            {/* Template Variables Mapping */}
            {detectedVariableIndices.length > 0 && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-medium block">
                  Map Template Variables ({detectedVariableIndices.length} required)
                </Label>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {detectedVariableIndices.map((idx) => {
                    const strIdx = String(idx);
                    const currentVal = variableMappings[strIdx] || '';
                    return (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-muted/20"
                      >
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                            {`{{${idx}}}`}
                          </Badge>
                          <span className="text-xs text-muted-foreground">maps to path:</span>
                        </div>
                        <div className="w-full sm:w-80">
                          <Input
                            value={currentVal}
                            onChange={(e) =>
                              setVariableMappings((prev) => ({
                                ...prev,
                                [strIdx]: e.target.value,
                              }))
                            }
                            placeholder="e.g. customer.name or static:Welcome"
                            className="font-mono text-xs h-8"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Prefix with <code>static:</code> to send a fixed value (e.g. <code>static:50% OFF</code>), or enter JSON path from payload (e.g. <code>order.id</code>).
                </p>
              </div>
            )}
          </div>

          {/* Section 4: Webhook URL & Credentials (for active/existing bot) */}
          {isEditing && initial && (
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Webhook className="h-3.5 w-3.5 text-primary" />
                4. Webhook URL & Secret Key
              </h3>

              {/* URL */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Your Unique Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={webhookUrl}
                    className="font-mono text-xs bg-muted/50 select-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(webhookUrl, 'url')}
                    className="shrink-0 gap-1.5 h-9"
                  >
                    {copiedUrl ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy URL
                  </Button>
                </div>
              </div>

              {/* Secret Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Secret Key</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenerateSecret}
                    disabled={regeneratingSecret}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                  >
                    <RotateCw className={`h-3 w-3 ${regeneratingSecret ? 'animate-spin' : ''}`} />
                    Regenerate Key
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    type={revealSecret ? 'text' : 'password'}
                    value={secretKey}
                    className="font-mono text-xs bg-muted/50 select-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRevealSecret((v) => !v)}
                    className="shrink-0 h-9 px-2.5"
                    title={revealSecret ? 'Hide Secret' : 'Reveal Secret'}
                  >
                    {revealSecret ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(secretKey, 'secret')}
                    className="shrink-0 gap-1.5 h-9"
                  >
                    {copiedSecret ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy Secret
                  </Button>
                </div>
              </div>

              {/* cURL snippet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Sample cURL Command</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(curlExample, 'curl')}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                  >
                    {copiedCurl ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Copy cURL
                  </Button>
                </div>
                <pre className="p-3 rounded bg-muted/60 border border-border font-mono text-[11px] overflow-auto leading-relaxed text-foreground whitespace-pre-wrap break-all">
                  {curlExample}
                </pre>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEditing ? 'Update Webhook Bot' : 'Create Webhook Bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
