'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate, TemplateButton } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  FileText,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Video,
  FileDown,
  Sparkles,
  Layers,
  MessageSquarePlus,
  Upload,
  Trash2,
  Plus,
  Reply,
  ExternalLink,
  Phone,
  Clock,
  Smartphone,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWhatsAppNumbers, numberName } from '@/hooks/use-whatsapp-numbers';
import { cn } from '@/lib/utils';
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import {
  CUSTOM_BROADCAST_TEMPLATE_NAME,
  isCustomBroadcastTemplate,
  templateFromCustomBroadcastConfig,
} from '@/lib/whatsapp/custom-broadcast';

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Utility: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Authentication: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

interface Step1Props {
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  onNext: () => void;
  onBack: () => void;
  /** Number the broadcast sends from (migration 057); null = default. */
  numberId?: string | null;
  onNumberChange?: (numberId: string, wabaId: string | null) => void;
}

type BroadcastMode = 'template' | 'custom';
type CustomMediaType = 'none' | 'image' | 'video';

interface EditableButton {
  id: string;
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

export function Step1ChooseTemplate({
  selectedTemplate,
  onSelect,
  onNext,
  onBack,
  numberId = null,
  onNumberChange,
}: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const { numbers, defaultNumber } = useWhatsAppNumbers();
  const sender = numbers.find((n) => n.id === numberId) ?? defaultNumber;
  const isWahaSender = sender?.waba_id === 'waha';

  const [mode, setMode] = useState<BroadcastMode>(() =>
    isCustomBroadcastTemplate(selectedTemplate?.name) ? 'custom' : 'template'
  );
  const effectiveMode: BroadcastMode = isWahaSender ? 'custom' : mode;

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // ── Custom Message Builder State (24h Window / WhatsApp Web) ────
  const [customMediaType, setCustomMediaType] = useState<CustomMediaType>(() => {
    if (isCustomBroadcastTemplate(selectedTemplate?.name)) {
      if (selectedTemplate?.header_type === 'image') return 'image';
      if (selectedTemplate?.header_type === 'video') return 'video';
    }
    return 'none';
  });
  const [customMediaUrl, setCustomMediaUrl] = useState<string>(() =>
    isCustomBroadcastTemplate(selectedTemplate?.name)
      ? selectedTemplate?.header_media_url ?? ''
      : ''
  );
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [customBodyText, setCustomBodyText] = useState<string>(() =>
    isCustomBroadcastTemplate(selectedTemplate?.name)
      ? selectedTemplate?.body_text ?? ''
      : ''
  );
  const [customFooterText, setCustomFooterText] = useState<string>(() =>
    isCustomBroadcastTemplate(selectedTemplate?.name)
      ? selectedTemplate?.footer_text ?? ''
      : ''
  );
  const [customButtons, setCustomButtons] = useState<EditableButton[]>(() => {
    if (
      isCustomBroadcastTemplate(selectedTemplate?.name) &&
      Array.isArray(selectedTemplate?.buttons)
    ) {
      return selectedTemplate!.buttons.map((b, i) => ({
        id: `btn_${i}_${Date.now()}`,
        type:
          b.type === 'URL'
            ? 'URL'
            : b.type === 'PHONE_NUMBER'
              ? 'PHONE_NUMBER'
              : 'QUICK_REPLY',
        text: b.text || '',
        url: b.type === 'URL' ? b.url : '',
        phone_number: b.type === 'PHONE_NUMBER' ? b.phone_number : '',
      }));
    }
    return [];
  });

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('message_templates')
          .select('*')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setTemplates(data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('chooseTemplate.errorLoad'));
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, [t]);

  // When a WhatsApp Web number is selected, always use Custom Message mode
  // because Meta Approved Templates only exist on Official Cloud API numbers.
  useEffect(() => {
    if (isWahaSender) {
      setMode('custom');
    }
  }, [isWahaSender]);

  // Keep parent `selectedTemplate` synced when in `custom` mode
  useEffect(() => {
    if (effectiveMode !== 'custom') return;

    const validButtons: TemplateButton[] = customButtons
      .filter((b) => b.text.trim().length > 0)
      .map((b) => {
        if (b.type === 'URL') {
          return {
            type: 'URL' as const,
            text: b.text.trim(),
            url: (b.url || 'https://').trim(),
          };
        }
        if (b.type === 'PHONE_NUMBER') {
          return {
            type: 'PHONE_NUMBER' as const,
            text: b.text.trim(),
            phone_number: (b.phone_number || '').trim(),
          };
        }
        return {
          type: 'QUICK_REPLY' as const,
          text: b.text.trim().slice(0, 20),
        };
      });

    const synthetic = templateFromCustomBroadcastConfig({
      bodyText: customBodyText,
      mediaType: customMediaType,
      mediaUrl: customMediaType === 'none' ? null : customMediaUrl,
      footerText: customFooterText,
      buttons: validButtons,
    });

    onSelect(synthetic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveMode,
    customBodyText,
    customMediaType,
    customMediaUrl,
    customFooterText,
    customButtons,
  ]);

  // Templates belong to a WABA: offer only the sender's (plus legacy rows).
  // WhatsApp Web ('waha') does not use Meta approved templates.
  const senderTemplates = useMemo(
    () =>
      isWahaSender
        ? []
        : sender?.waba_id
          ? templates.filter((tpl) => !tpl.waba_id || tpl.waba_id === sender.waba_id)
          : templates,
    [templates, sender?.waba_id, isWahaSender]
  );

  const filteredTemplates = useMemo(() => {
    return senderTemplates.filter((tpl) => {
      const matchesSearch =
        !searchTerm.trim() ||
        tpl.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tpl.body_text && tpl.body_text.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCat =
        selectedCategory === 'ALL' ||
        tpl.category?.toUpperCase() === selectedCategory.toUpperCase();

      return matchesSearch && matchesCat;
    });
  }, [senderTemplates, searchTerm, selectedCategory]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    senderTemplates.forEach((tpl) => {
      if (tpl.category) set.add(tpl.category.toUpperCase());
    });
    return ['ALL', ...Array.from(set)];
  }, [senderTemplates]);

  async function handleCustomMediaUpload(file: File) {
    if (customMediaType === 'none') return;
    const maxBytes = MEDIA_MAX_BYTES_BY_KIND[customMediaType];
    if (file.size > maxBytes) {
      toast.error(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max allowed is ${Math.round(
          maxBytes / 1024 / 1024
        )} MB.`
      );
      return;
    }

    setUploadingMedia(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setCustomMediaUrl(publicUrl);
      setUploadedFileName(file.name);
      toast.success(
        customMediaType === 'image'
          ? 'Image uploaded successfully!'
          : 'Video uploaded successfully!'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload media');
    } finally {
      setUploadingMedia(false);
    }
  }

  function insertVariableAtCursor(placeholder: string) {
    const el = bodyTextareaRef.current;
    if (!el) {
      setCustomBodyText((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${placeholder}`);
      return;
    }
    const start = el.selectionStart ?? customBodyText.length;
    const end = el.selectionEnd ?? customBodyText.length;
    const next =
      customBodyText.slice(0, start) + placeholder + customBodyText.slice(end);
    setCustomBodyText(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 0);
  }

  function addCustomButton(presetText?: string, presetType: EditableButton['type'] = 'QUICK_REPLY') {
    if (customButtons.length >= 3) {
      toast.error('Maximum 3 buttons can be added to a WhatsApp message.');
      return;
    }
    setCustomButtons((prev) => [
      ...prev,
      {
        id: `btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: presetType,
        text: presetText || '',
        url: presetType === 'URL' ? 'https://' : '',
        phone_number: presetType === 'PHONE_NUMBER' ? '+91' : '',
      },
    ]);
  }

  function updateCustomButton(id: string, patch: Partial<EditableButton>) {
    setCustomButtons((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  }

  function removeCustomButton(id: string) {
    setCustomButtons((prev) => prev.filter((b) => b.id !== id));
  }

  const isCustomValid = useMemo(() => {
    if (!customBodyText.trim()) return false;
    if (customMediaType !== 'none' && !customMediaUrl.trim()) return false;
    for (const b of customButtons) {
      if (!b.text.trim()) return false;
      if (b.type === 'URL' && (!b.url || !b.url.trim().startsWith('http'))) return false;
      if (b.type === 'PHONE_NUMBER' && !b.phone_number?.trim()) return false;
    }
    return true;
  }, [customBodyText, customMediaType, customMediaUrl, customButtons]);

  const canProceed =
    effectiveMode === 'custom'
      ? isCustomValid
      : Boolean(selectedTemplate && !isCustomBroadcastTemplate(selectedTemplate.name));

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  const previewBodyText = (customBodyText || 'Write your broadcast message here...')
    .replace(/\{\{1\}\}/g, 'Rahul Sharma')
    .replace(/\{\{(\d+)\}\}/g, (_, n) => `[Var ${n}]`);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('chooseTemplate.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an approved template or compose a direct custom message (with image/video & buttons) for 24-Hour Active Window contacts or WhatsApp Web.
        </p>
      </div>

      {/* Sender WhatsApp Number Selector */}
      {numbers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('chooseTemplate.sendFrom')}
          </p>
          <div className="flex flex-wrap gap-2">
            {numbers.map((n) => {
              const active = sender?.id === n.id;
              const isWaha = n.waba_id === 'waha';
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onNumberChange?.(n.id, n.waba_id ?? null)}
                  className={cn(
                    'flex min-w-0 max-w-[18rem] items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all',
                    active
                      ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-sm'
                      : 'border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      active
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {numberName(n)}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          isWaha
                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        )}
                      >
                        {isWaha ? 'WhatsApp Web' : 'Official API'}
                      </span>
                    </div>
                    {n.display_phone_number && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {n.display_phone_number}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Broadcast Mode Switcher: shown only for Official API numbers (WhatsApp Web always uses Custom Message) */}
      {!isWahaSender && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode('template')}
            className={cn(
              'flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all',
              mode === 'template'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/25 shadow-sm'
                : 'border-border bg-card/60 hover:border-primary/40 hover:bg-card'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                mode === 'template'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Approved Template Message
                </p>
                {mode === 'template' && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Send Meta pre-approved templates to any contact list anytime (outside or inside 24h window).
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('custom')}
            className={cn(
              'flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all',
              mode === 'custom'
                ? 'border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/25 shadow-sm'
                : 'border-border bg-card/60 hover:border-emerald-500/40 hover:bg-card'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                mode === 'custom'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">
                    24-Hour Window Message (No Template)
                  </p>
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                    24h Active Chats
                  </span>
                </div>
                {mode === 'custom' && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                Attach Image or Video + write custom text + add interactive buttons for 24-hour active window contacts.
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ── MODE 1: APPROVED TEMPLATES (Only for Official API) ──────── */}
      {effectiveMode === 'template' && (
        <>
          {/* Search & Category Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search templates by name or content..."
                className="pl-9 bg-card/60 border-border text-foreground text-sm"
              />
            </div>

            {/* Categories Tab Pill */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/40 rounded-lg border border-border">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    selectedCategory === cat
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat === 'ALL' ? 'All Templates' : cat}
                </button>
              ))}
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50 p-6 text-center">
              <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('chooseTemplate.noTemplates')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Or switch to <strong>Custom Message (No Template)</strong> above to send right away!
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setMode('custom')}
                className="mt-3 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <MessageSquarePlus className="mr-1.5 h-4 w-4" />
                Compose Custom Message
              </Button>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30">
              <Search className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No approved templates found matching your search
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('ALL');
                }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                const catColor =
                  categoryColors[template.category] ?? categoryColors.Utility;

                const varMatches =
                  template.body_text?.match(/\{\{(\d+)\}\}/g) || [];
                const uniqueVars = Array.from(new Set(varMatches));
                const varCount = uniqueVars.length;
                const mappingConfig = template.variable_mapping || {};
                const isMapped =
                  varCount === 0 ||
                  uniqueVars.every((v) => {
                    const key = v.replace(/[{}]/g, '');
                    return !!mappingConfig[key];
                  });

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onSelect(template)}
                    className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all group ${
                      isSelected
                        ? 'border-emerald-500/80 bg-emerald-500/5 ring-2 ring-emerald-500/30 shadow-md'
                        : 'border-border bg-card/60 hover:border-primary/40 hover:bg-card'
                    }`}
                  >
                    <div>
                      {/* Header Row: Title & Category */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {template.name}
                          </h3>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {template.language ?? 'en_US'}
                          </span>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                        >
                          {template.category}
                        </span>
                      </div>

                      {/* Header Type Badge */}
                      {template.header_type && template.header_type !== 'text' && (
                        <div className="mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground border border-border">
                          {template.header_type === 'image' && (
                            <ImageIcon className="h-3 w-3 text-emerald-400" />
                          )}
                          {template.header_type === 'video' && (
                            <Video className="h-3 w-3 text-blue-400" />
                          )}
                          {template.header_type === 'document' && (
                            <FileDown className="h-3 w-3 text-amber-400" />
                          )}
                          <span className="capitalize">
                            {template.header_type} Header
                          </span>
                        </div>
                      )}

                      {/* Body preview */}
                      <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed">
                        {template.body_text}
                      </p>
                    </div>

                    {/* Footer Badges */}
                    <div className="mt-3.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px]">
                      {varCount > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                            <Layers className="h-3 w-3 text-muted-foreground" />
                            {varCount} {varCount === 1 ? 'variable' : 'variables'}
                          </span>
                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              <AlertCircle className="h-2.5 w-2.5" />
                              Needs Mapping
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                          Static Text
                        </span>
                      )}

                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                          <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-500/20" />
                          Selected
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── MODE 2: CUSTOM MESSAGE COMPOSER (24H WINDOW / WHATSAPP WEB) ─ */}
      {effectiveMode === 'custom' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Composer Controls */}
          <div className="space-y-5 lg:col-span-7">
            {/* Info Banner */}
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                {isWahaSender ? (
                  <>
                    <span className="font-semibold text-foreground">
                      WhatsApp Web Connected:
                    </span>{' '}
                    You can send custom text, images, videos, and buttons to{' '}
                    <span className="font-medium text-emerald-500">
                      All Contacts, Tags, CSV, or 24-Hour Active Chats
                    </span>{' '}
                    without any template approval.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">
                      24-Hour Customer Service Window (Official API):
                    </span>{' '}
                    Meta allows sending free-form text, images, videos, and interactive buttons without template approval to customers who messaged you in the{' '}
                    <span className="font-medium text-emerald-500">
                      last 24 hours
                    </span>
                    .
                  </>
                )}
              </div>
            </div>

            {/* 1. Media Attachment (None / Image / Video) */}
            <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground">
                  1. Attach Image or Video (Optional)
                </label>
                <span className="text-[11px] text-muted-foreground">
                  Header Media
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { type: 'none', label: 'No Media', icon: FileText },
                    { type: 'image', label: 'Image', icon: ImageIcon },
                    { type: 'video', label: 'Video', icon: Video },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = customMediaType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        setCustomMediaType(item.type);
                        if (item.type === 'none') {
                          setCustomMediaUrl('');
                          setUploadedFileName('');
                        }
                      }}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all',
                        active
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                          : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {customMediaType !== 'none' && (
                <div className="space-y-3 pt-1">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept={
                      customMediaType === 'image'
                        ? 'image/jpeg,image/png,image/webp'
                        : 'video/mp4,video/3gpp'
                    }
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCustomMediaUpload(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => mediaInputRef.current?.click()}
                      disabled={uploadingMedia}
                      className="flex-1 border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                    >
                      {uploadingMedia ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading {customMediaType}...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload {customMediaType === 'image' ? 'Image (JPG/PNG)' : 'Video (MP4)'}
                        </>
                      )}
                    </Button>

                    {customMediaUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCustomMediaUrl('');
                          setUploadedFileName('');
                        }}
                        className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Remove
                      </Button>
                    )}
                  </div>

                  <div>
                    <Input
                      value={customMediaUrl}
                      onChange={(e) => setCustomMediaUrl(e.target.value)}
                      placeholder={`Or paste direct ${customMediaType} URL (https://...)`}
                      className="h-9 bg-background/70 text-xs"
                    />
                    {uploadedFileName && (
                      <p className="mt-1 text-[11px] text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Uploaded: {uploadedFileName}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Message Text (Body) */}
            <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-sm font-semibold text-foreground">
                  2. Message Text <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => insertVariableAtCursor('{{1}}')}
                    className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    + Add {'{{1}}'} (Customer Name)
                  </button>
                </div>
              </div>

              <textarea
                ref={bodyTextareaRef}
                rows={5}
                value={customBodyText}
                onChange={(e) => setCustomBodyText(e.target.value)}
                placeholder="Hello {{1}}, thank you for contacting us! Check out our special offer today..."
                className="w-full rounded-lg border border-border bg-background/80 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Tip: Use <strong>*bold*</strong>, <em>_italic_</em>, and{' '}
                  <code>{'{{1}}'}</code> for customer name personalization.
                </span>
                <span>{customBodyText.length} / 1024</span>
              </div>
            </div>

            {/* 3. Interactive Buttons (Optional — Up to 3) */}
            <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-foreground">
                    3. Interactive Buttons (Optional)
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Add up to 3 buttons (Quick Reply, Website URL, or Phone Call)
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={customButtons.length >= 3}
                  onClick={() => addCustomButton()}
                  className="h-8 border-primary/30 text-xs text-primary hover:bg-primary/10"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Button ({customButtons.length}/3)
                </Button>
              </div>

              {/* Quick Preset Chips */}
              {customButtons.length < 3 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground mr-1">
                    Quick add:
                  </span>
                  {[
                    { label: 'Interested', type: 'QUICK_REPLY' as const },
                    { label: 'Book Demo', type: 'QUICK_REPLY' as const },
                    { label: 'Call Me', type: 'QUICK_REPLY' as const },
                    { label: 'Visit Website', type: 'URL' as const },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => addCustomButton(preset.label, preset.type)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}

              {customButtons.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  {customButtons.map((btn, idx) => (
                    <div
                      key={btn.id}
                      className="rounded-lg border border-border bg-background/60 p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          #{idx + 1}
                        </span>
                        <select
                          value={btn.type}
                          onChange={(e) =>
                            updateCustomButton(btn.id, {
                              type: e.target.value as EditableButton['type'],
                            })
                          }
                          className="h-8 rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary"
                        >
                          <option value="QUICK_REPLY">Quick Reply Button</option>
                          <option value="URL">Website Link (URL)</option>
                          <option value="PHONE_NUMBER">Phone Call</option>
                        </select>

                        <Input
                          value={btn.text}
                          maxLength={20}
                          onChange={(e) =>
                            updateCustomButton(btn.id, { text: e.target.value })
                          }
                          placeholder="Button label (max 20 chars)"
                          className="h-8 flex-1 text-xs"
                        />

                        <button
                          type="button"
                          onClick={() => removeCustomButton(btn.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {btn.type === 'URL' && (
                        <Input
                          value={btn.url || ''}
                          onChange={(e) =>
                            updateCustomButton(btn.id, { url: e.target.value })
                          }
                          placeholder="https://yourwebsite.com/offer"
                          className="h-8 text-xs font-mono"
                        />
                      )}

                      {btn.type === 'PHONE_NUMBER' && (
                        <Input
                          value={btn.phone_number || ''}
                          onChange={(e) =>
                            updateCustomButton(btn.id, {
                              phone_number: e.target.value,
                            })
                          }
                          placeholder="+919876543210"
                          className="h-8 text-xs font-mono"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Optional Footer Text */}
            <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
              <label className="block text-xs font-semibold text-foreground">
                4. Footer Text (Optional)
              </label>
              <Input
                value={customFooterText}
                maxLength={60}
                onChange={(e) => setCustomFooterText(e.target.value)}
                placeholder="e.g. Reply STOP to unsubscribe"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Right Column: Live WhatsApp Preview */}
          <div className="lg:col-span-5">
            <div className="sticky top-6 rounded-2xl border border-border bg-[#0b141a] p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-white/90">
                    WhatsApp Live Preview
                  </span>
                </div>
                <span className="text-[10px] text-white/50">
                  {isWahaSender ? 'WhatsApp Web' : '24h Interactive / Media'}
                </span>
              </div>

              <div className="mx-auto max-w-xs space-y-1.5 py-2">
                {/* Message Bubble */}
                <div className="overflow-hidden rounded-xl rounded-tl-none bg-[#202c33] text-white shadow">
                  {/* Media Header Preview */}
                  {customMediaType === 'image' && (
                    <div className="relative aspect-video w-full bg-black/40 flex items-center justify-center overflow-hidden">
                      {customMediaUrl ? (
                        <img
                          src={customMediaUrl}
                          alt="Broadcast header"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-white/40">
                          <ImageIcon className="h-7 w-7" />
                          <span className="text-[11px]">Upload an image</span>
                        </div>
                      )}
                    </div>
                  )}

                  {customMediaType === 'video' && (
                    <div className="relative aspect-video w-full bg-black/50 flex items-center justify-center overflow-hidden">
                      {customMediaUrl ? (
                        <video
                          src={customMediaUrl}
                          controls
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-white/40">
                          <Video className="h-7 w-7" />
                          <span className="text-[11px]">Upload a video</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Body & Footer */}
                  <div className="p-3 space-y-1.5">
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/95">
                      {previewBodyText}
                    </p>
                    {customFooterText.trim() && (
                      <p className="text-[11px] text-white/50">
                        {customFooterText}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <span className="text-[10px] text-white/40">10:30 AM</span>
                    </div>
                  </div>
                </div>

                {/* Interactive Buttons Preview */}
                {customButtons.filter((b) => b.text.trim()).length > 0 && (
                  <div className="space-y-1">
                    {customButtons
                      .filter((b) => b.text.trim())
                      .map((btn) => (
                        <div
                          key={btn.id}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-[#202c33] py-2 px-3 text-center text-xs font-medium text-[#00a884] shadow"
                        >
                          {btn.type === 'URL' ? (
                            <ExternalLink className="h-3.5 w-3.5" />
                          ) : btn.type === 'PHONE_NUMBER' ? (
                            <Phone className="h-3.5 w-3.5" />
                          ) : (
                            <Reply className="h-3.5 w-3.5" />
                          )}
                          <span>{btn.text}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
