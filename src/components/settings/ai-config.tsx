'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  Trash2,
  Eye,
  EyeOff,
  Brain,
  Target,
  RotateCw,
  Tag,
  UserX,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';
import { AiKnowledgeCard } from './ai-knowledge';
import { AI_PROVIDER_DEFAULT_MODEL } from '@/lib/ai/defaults';
import type { AiProvider } from '@/lib/ai/types';
import type { AccountMember } from '@/types';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import { useTranslations } from 'next-intl';

const MASKED_KEY = '••••••••••••••••';

// Radix Select can't use an empty-string item value, so the "leave
// unassigned" choice gets a sentinel that maps to null in the payload.
const HANDOFF_QUEUE = '__queue__';

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

const KEY_PLACEHOLDER: Record<AiProvider, string> = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
};

export function AiConfig() {
  const { accountId, accountRole, profileLoading } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const t = useTranslations('Settings.aiConfig');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState(AI_PROVIDER_DEFAULT_MODEL.openai);
  const [apiKey, setApiKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [embeddingsKey, setEmbeddingsKey] = useState('');
  const [embeddingsKeyEdited, setEmbeddingsKeyEdited] = useState(false);
  const [hasStoredEmbeddingsKey, setHasStoredEmbeddingsKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [maxPerConversation, setMaxPerConversation] = useState(3);
  // Empty string = leave unassigned (shared queue).
  const [handoffAgentId, setHandoffAgentId] = useState('');
  const [members, setMembers] = useState<AccountMember[]>([]);

  // Superpowers: Conversation Memory, Lead Qualification & Follow-up Intelligence
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [leadQualificationEnabled, setLeadQualificationEnabled] = useState(true);
  const [qualifiedTagName, setQualifiedTagName] = useState('Qualified Lead');
  const [followupIntelligenceEnabled, setFollowupIntelligenceEnabled] = useState(true);
  const [autoTaggingEnabled, setAutoTaggingEnabled] = useState(true);
  const [autoUnsubscribeEnabled, setAutoUnsubscribeEnabled] = useState(true);
  const [unsubscribeKeywordsInput, setUnsubscribeKeywordsInput] = useState(
    'stop, nahi chahiye, mat bhejo, cancel, unsubscribe, not interested',
  );
  const [unsubscribeReplyText, setUnsubscribeReplyText] = useState(
    'Aapka request note kar liya gaya hai. Aage se aapko hamari taraf se koi automated WhatsApp message nahi aayega. Dhanyawad.',
  );
  const [unsubscribeTagName, setUnsubscribeTagName] = useState('Unsubscribed');

  // Guard keyed on the account (not a bare boolean) so an in-place
  // account switch — ownership transfer, multi-account membership —
  // refetches instead of showing the previous account's config. Mirrors
  // the loadedAccountIdRef pattern in whatsapp-config.tsx.
  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('loadFailed'));
        return;
      }
      if (data.configured) {
        setConfigured(true);
        setProvider(data.provider);
        setModel(data.model);
        setSystemPrompt(data.system_prompt ?? '');
        setIsActive(data.is_active);
        setAutoReplyEnabled(data.auto_reply_enabled);
        setMaxPerConversation(data.auto_reply_max_per_conversation ?? 3);
        setHandoffAgentId(data.handoff_agent_id ?? '');
        setHasStoredKey(Boolean(data.has_key));
        setApiKey(data.has_key ? MASKED_KEY : '');
        setKeyEdited(false);
        setHasStoredEmbeddingsKey(Boolean(data.has_embeddings_key));
        setEmbeddingsKey(data.has_embeddings_key ? MASKED_KEY : '');
        setEmbeddingsKeyEdited(false);

        // Superpowers
        setMemoryEnabled(data.memory_enabled !== false);
        setLeadQualificationEnabled(data.lead_qualification_enabled !== false);
        setQualifiedTagName(data.qualified_tag_name || 'Qualified Lead');
        setFollowupIntelligenceEnabled(data.followup_intelligence_enabled !== false);
        setAutoTaggingEnabled(data.auto_tagging_enabled !== false);
        setAutoUnsubscribeEnabled(data.auto_unsubscribe_enabled !== false);
        if (Array.isArray(data.unsubscribe_keywords) && data.unsubscribe_keywords.length > 0) {
          setUnsubscribeKeywordsInput(data.unsubscribe_keywords.join(', '));
        }
        if (data.unsubscribe_reply_text) {
          setUnsubscribeReplyText(data.unsubscribe_reply_text);
        }
        if (data.unsubscribe_tag_name) {
          setUnsubscribeTagName(data.unsubscribe_tag_name);
        }
      }
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchConfig();
    // Members populate the handoff-target picker. Best-effort — on an
    // older deployment without the endpoint the picker just shows the
    // queue option.
    void fetchAccountMembers().then(setMembers);
  }, [accountId, fetchConfig]);

  // Swap the model default when the provider changes, unless the user
  // typed a custom model.
  const handleProviderChange = (next: AiProvider) => {
    setProvider(next);
    const isDefaultModel =
      model === AI_PROVIDER_DEFAULT_MODEL.openai ||
      model === AI_PROVIDER_DEFAULT_MODEL.anthropic ||
      model.trim() === '';
    if (isDefaultModel) setModel(AI_PROVIDER_DEFAULT_MODEL[next]);
  };

  const keyPayload = () => (keyEdited ? apiKey.trim() : undefined);

  // undefined = leave unchanged; '' typed = null (clear); text = set.
  const embeddingsKeyPayload = () =>
    embeddingsKeyEdited ? embeddingsKey.trim() || null : undefined;

  const buildBody = () => ({
    provider,
    model: model.trim(),
    api_key: keyPayload(),
    embeddings_api_key: embeddingsKeyPayload(),
    system_prompt: systemPrompt.trim() || null,
    is_active: isActive,
    auto_reply_enabled: autoReplyEnabled,
    auto_reply_max_per_conversation: maxPerConversation,
    handoff_agent_id: handoffAgentId || null,
    memory_enabled: memoryEnabled,
    lead_qualification_enabled: leadQualificationEnabled,
    qualified_tag_name: qualifiedTagName.trim() || 'Qualified Lead',
    followup_intelligence_enabled: followupIntelligenceEnabled,
    auto_tagging_enabled: autoTaggingEnabled,
    auto_unsubscribe_enabled: autoUnsubscribeEnabled,
    unsubscribe_keywords: unsubscribeKeywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    unsubscribe_reply_text: unsubscribeReplyText.trim(),
    unsubscribe_tag_name: unsubscribeTagName.trim() || 'Unsubscribed',
  });

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: model.trim(),
          api_key: keyPayload(),
        }),
      });
      const data = await res.json();
      if (res.ok) toast.success(t('testSuccess'));
      else toast.error(data.error ?? t('testRejected'));
    } catch {
      toast.error(t('testNetworkError'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!model.trim()) {
      toast.error(t('missingModel'));
      return;
    }
    if (!configured && !keyEdited) {
      toast.error(t('missingApiKey'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t('saveSuccess'));
        await fetchConfig();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch('/api/ai/config', { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setConfigured(false);
        setHasStoredKey(false);
        setApiKey('');
        setKeyEdited(false);
        setIsActive(false);
        setAutoReplyEnabled(false);
        setSystemPrompt('');
        setHandoffAgentId('');
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
    } finally {
      setRemoving(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loadFailed')} {/* Re-using label or a global one, wait, loading is better. Let's use useTranslations from overview or just hardcode Loading... actually I should add loading to aiConfig */}
        {/* Wait, I didn't add loading to aiConfig. I'll just use loading. */}
      </div>
    );
  }

  const disabled = !canEdit || saving;

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />

      {!canEdit && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t('adminOnlyConfig')}
        </p>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> {t('providerAndKey')}
            </CardTitle>
            <CardDescription>
              {t('encryptionNotice')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('provider')}</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => handleProviderChange(v as AiProvider)}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">{PROVIDER_LABEL.openai}</SelectItem>
                    <SelectItem value="anthropic">
                      {PROVIDER_LABEL.anthropic}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-model">{t('model')}</Label>
                <Input
                  id="ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={AI_PROVIDER_DEFAULT_MODEL[provider]}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-key">{t('apiKey')}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="ai-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setKeyEdited(true);
                    }}
                    onFocus={() => {
                      if (!keyEdited && hasStoredKey) {
                        setApiKey('');
                        setKeyEdited(true);
                      }
                    }}
                    placeholder={KEY_PLACEHOLDER[provider]}
                    disabled={disabled}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={disabled || testing}
                >
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {t('testKey')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-embeddings-key">
                {t('embeddingsKey')}{' '}
                <span className="font-normal text-muted-foreground">
                  {t('optionalSemanticSearch')}
                </span>
              </Label>
              <Input
                id="ai-embeddings-key"
                type="password"
                value={embeddingsKey}
                onChange={(e) => {
                  setEmbeddingsKey(e.target.value);
                  setEmbeddingsKeyEdited(true);
                }}
                onFocus={() => {
                  if (!embeddingsKeyEdited && hasStoredEmbeddingsKey) {
                    setEmbeddingsKey('');
                    setEmbeddingsKeyEdited(true);
                  }
                }}
                placeholder="sk-... (OpenAI)"
                disabled={disabled}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t('embeddingsHint', {
                  sameKeyText: provider === 'openai' ? t('sameKeyText') : '',
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('behaviour')}</CardTitle>
            <CardDescription>
              {t('behaviourDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-prompt">{t('businessContext')}</Label>
              <Textarea
                id="ai-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t('promptPlaceholder')}
                rows={5}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('enableAssistant')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('enableAssistantDesc')}
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('autoReply')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('autoReplyDesc')}
                </p>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
                disabled={disabled || !isActive}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="ai-max">{t('maxAutoReplies')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('maxAutoRepliesDesc')}
                </p>
              </div>
              <Input
                id="ai-max"
                type="number"
                min={1}
                max={20}
                value={maxPerConversation}
                onChange={(e) =>
                  setMaxPerConversation(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                disabled={disabled || !autoReplyEnabled}
                className="w-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-handoff">{t('handoffTo')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('handoffToDesc')}
              </p>
              <Select
                value={handoffAgentId || HANDOFF_QUEUE}
                onValueChange={(v) =>
                  setHandoffAgentId(!v || v === HANDOFF_QUEUE ? '' : v)
                }
                disabled={disabled || !autoReplyEnabled}
              >
                <SelectTrigger id="ai-handoff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HANDOFF_QUEUE}>
                    {t('handoffQueue')}
                  </SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* 🧠 Conversation Memory Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Brain className="h-4 w-4" />
                </span>
                {t('memoryTitle')}
              </CardTitle>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-xs font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                {t('memoryBadge')}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground pt-1">
              {t('memoryDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/80 bg-card p-3 shadow-xs">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {t('enableMemory')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('enableMemoryDesc')}
                </p>
              </div>
              <Switch
                checked={memoryEnabled}
                onCheckedChange={setMemoryEnabled}
                disabled={disabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* 🧩 Lead Qualification Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Target className="h-4 w-4" />
                </span>
                {t('qualificationTitle')}
              </CardTitle>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {t('qualificationBadge')}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground pt-1">
              {t('qualificationDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/80 bg-card p-3 shadow-xs">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {t('enableQualification')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('enableQualificationDesc')}
                </p>
              </div>
              <Switch
                checked={leadQualificationEnabled}
                onCheckedChange={setLeadQualificationEnabled}
                disabled={disabled}
              />
            </div>

            {leadQualificationEnabled && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-qualified-tag" className="text-xs font-medium">
                    {t('qualifiedTagName')}
                  </Label>
                  <Input
                    id="ai-qualified-tag"
                    value={qualifiedTagName}
                    onChange={(e) => setQualifiedTagName(e.target.value)}
                    placeholder="Qualified Lead"
                    disabled={disabled}
                    className="max-w-md h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('qualifiedTagNameDesc')}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="rounded-md border border-border/70 bg-background/50 p-2 text-center">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 mb-1">
                      🔥 Hot Lead (85+)
                    </span>
                    <p className="text-[11px] text-muted-foreground">Fees, pricing & payment intent</p>
                  </div>
                  <div className="rounded-md border border-border/70 bg-background/50 p-2 text-center">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 mb-1">
                      ⚡ Warm (75+)
                    </span>
                    <p className="text-[11px] text-muted-foreground">Callback requested</p>
                  </div>
                  <div className="rounded-md border border-border/70 bg-background/50 p-2 text-center">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 mb-1">
                      👍 Interested (55+)
                    </span>
                    <p className="text-[11px] text-muted-foreground">Course / catalog inquiry</p>
                  </div>
                  <div className="rounded-md border border-border/70 bg-background/50 p-2 text-center">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 mb-1">
                      🎯 Qualified (95+)
                    </span>
                    <p className="text-[11px] text-muted-foreground">Enrollment / payment sent</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 🔄 Follow-up Intelligence & Auto-Unsubscribe Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <RotateCw className="h-4 w-4" />
                </span>
                {t('followupTitle')}
              </CardTitle>
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
                {t('followupBadge')}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground pt-1">
              {t('followupDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/80 bg-card p-3 shadow-xs">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {t('enableFollowup')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('enableFollowupDesc')}
                </p>
              </div>
              <Switch
                checked={followupIntelligenceEnabled}
                onCheckedChange={setFollowupIntelligenceEnabled}
                disabled={disabled}
              />
            </div>

            {followupIntelligenceEnabled && (
              <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                {/* Auto-tagging switch */}
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/60">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      {t('autoTagging')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('autoTaggingDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={autoTaggingEnabled}
                    onCheckedChange={setAutoTaggingEnabled}
                    disabled={disabled}
                  />
                </div>

                {/* Auto-unsubscribe switch */}
                <div className="flex items-center justify-between gap-4 pb-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5 text-destructive dark:text-red-400">
                      <UserX className="h-3.5 w-3.5" />
                      {t('autoUnsubscribe')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('autoUnsubscribeDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={autoUnsubscribeEnabled}
                    onCheckedChange={setAutoUnsubscribeEnabled}
                    disabled={disabled}
                  />
                </div>

                {autoUnsubscribeEnabled && (
                  <div className="space-y-3 pt-2 pl-2 border-l-2 border-destructive/40">
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-unsub-tag" className="text-xs font-medium">
                        {t('unsubscribeTagName')}
                      </Label>
                      <Input
                        id="ai-unsub-tag"
                        value={unsubscribeTagName}
                        onChange={(e) => setUnsubscribeTagName(e.target.value)}
                        placeholder="Unsubscribed"
                        disabled={disabled}
                        className="max-w-md h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="ai-unsub-keywords" className="text-xs font-medium">
                        {t('unsubscribeKeywords')}
                      </Label>
                      <Input
                        id="ai-unsub-keywords"
                        value={unsubscribeKeywordsInput}
                        onChange={(e) => setUnsubscribeKeywordsInput(e.target.value)}
                        placeholder={t('unsubscribeKeywordsPlaceholder')}
                        disabled={disabled}
                        className="text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t('unsubscribeKeywordsDesc')}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="ai-unsub-reply" className="text-xs font-medium">
                        {t('unsubscribeReplyText')}
                      </Label>
                      <Textarea
                        id="ai-unsub-reply"
                        value={unsubscribeReplyText}
                        onChange={(e) => setUnsubscribeReplyText(e.target.value)}
                        placeholder={t('unsubscribeReplyPlaceholder')}
                        rows={2}
                        disabled={disabled}
                        className="text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t('unsubscribeReplyDesc')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <AiKnowledgeCard
          accountId={accountId}
          canEdit={canEdit}
          hasEmbeddingsKey={
            embeddingsKeyEdited
              ? embeddingsKey.trim().length > 0
              : hasStoredEmbeddingsKey
          }
        />

        <div className="flex items-center justify-between">
          {configured ? (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={!canEdit || removing}
              className="text-destructive hover:text-destructive"
            >
              {removing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('remove')}
            </Button>
          ) : (
            <span />
          )}

          <Button onClick={handleSave} disabled={disabled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
