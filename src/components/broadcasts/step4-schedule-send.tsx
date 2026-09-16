'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Send,
  Loader2,
  Users,
  Save,
  Image as ImageIcon,
  Video,
  FileText,
  Layers,
  Sparkles,
  Calendar,
  User,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AudienceConfig {
  type: string;
  tagIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
}

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables?: Record<
    string,
    { type: 'static' | 'field' | 'custom_field' | 'date'; value: string; fallback?: string }
  >;
  headerMediaUrl?: string;
  onSend: () => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  variables = {},
  headerMediaUrl,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
}: Step4Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        if (audience.type === 'all') {
          const { count } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true });
          setEstimatedReach(count ?? 0);
        } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.tagIds);

          const uniqueIds = new Set((contactTags ?? []).map((ct) => ct.contact_id));
          setEstimatedReach(uniqueIds.size);
        } else if (audience.type === 'csv' && audience.csvContacts) {
          setEstimatedReach(audience.csvContacts.length);
        } else {
          setEstimatedReach(0);
        }
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  const audienceLabel =
    audience.type === 'all'
      ? t('scheduleSend.audienceAll')
      : audience.type === 'tags'
        ? t('scheduleSend.audienceTags')
        : audience.type === 'csv'
          ? t('scheduleSend.audienceCsv')
          : t('scheduleSend.audienceField');

  // Extract variable keys in template
  const varMatches = template.body_text?.match(/\{\{(\d+)\}\}/g) || [];
  const uniqueVars = Array.from(new Set(varMatches)).map((v) => v.replace(/[{}]/g, ''));

  function getFieldLabel(type: string, value: string) {
    if (type === 'field') {
      if (value === 'name') return 'Contact Full Name';
      if (value === 'first_name') return 'Contact First Name';
      if (value === 'phone') return 'Phone Number';
      if (value === 'email') return 'Email Address';
      if (value === 'company') return 'Company Name';
      return `Contact Field (${value})`;
    }
    if (type === 'date') {
      if (value === 'today_iso') return "Today's Date (YYYY-MM-DD)";
      return "Today's Date (DD/MM/YYYY)";
    }
    if (type === 'static') {
      return `Static: "${value}"`;
    }
    if (type === 'custom_field') {
      return `Custom Field: ${value}`;
    }
    return value || 'Not mapped';
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('scheduleSend.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('scheduleSend.subtitle')}
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('scheduleSend.broadcastName')}</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('scheduleSend.broadcastNamePlaceholder')}
          className="border-border bg-card text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {t('scheduleSend.summary')}
          </p>
          <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 rounded bg-muted/60">
            {template.language ?? 'en_US'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">{t('scheduleSend.template')}</p>
            <p className="font-medium text-foreground truncate">{template.name}</p>
            <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{template.category.toLowerCase()}</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">{t('scheduleSend.audience')}</p>
            <p className="font-medium text-foreground">{audienceLabel}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {estimatedReach.toLocaleString()} recipients
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Header Media info */}
          {template.header_type && template.header_type !== 'text' && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 sm:col-span-2 lg:col-span-1">
              <p className="text-xs text-muted-foreground mb-1">Header Media</p>
              <div className="flex items-center gap-2">
                {template.header_type === 'image' && <ImageIcon className="h-4 w-4 text-emerald-400 shrink-0" />}
                {template.header_type === 'video' && <Video className="h-4 w-4 text-blue-400 shrink-0" />}
                {template.header_type === 'document' && <FileText className="h-4 w-4 text-amber-400 shrink-0" />}
                <span className="text-xs font-medium text-foreground truncate">
                  {headerMediaUrl ? 'Media Attached' : 'No Media Uploaded'}
                </span>
              </div>
              {headerMediaUrl && template.header_type === 'image' && (
                <div className="mt-2 h-14 w-24 rounded overflow-hidden border border-border bg-black/40">
                  <img src={headerMediaUrl} alt="Header Preview" className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Variable Mapping Breakdown Table */}
        {uniqueVars.length > 0 && (
          <div className="pt-3 border-t border-border/60">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Personalized Variables ({uniqueVars.length})
              </p>
              <span className="text-[11px] text-muted-foreground">Mapped to CRM fields</span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border/60 font-medium">
                  <tr>
                    <th className="px-3 py-2">Variable</th>
                    <th className="px-3 py-2">Mapped Source</th>
                    <th className="px-3 py-2">Fallback Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {uniqueVars.map((varNum) => {
                    const mapping = variables[varNum];
                    return (
                      <tr key={varNum} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 font-mono font-semibold text-emerald-400">
                          {`{{${varNum}}}`}
                        </td>
                        <td className="px-3 py-2">
                          {mapping ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                              {mapping.type === 'field' && <User className="h-3 w-3" />}
                              {mapping.type === 'date' && <Calendar className="h-3 w-3" />}
                              {mapping.type === 'custom_field' && <Tag className="h-3 w-3" />}
                              {mapping.type === 'static' && <Sparkles className="h-3 w-3" />}
                              {getFieldLabel(mapping.type, mapping.value)}
                            </span>
                          ) : (
                            <span className="text-amber-400 italic text-[11px]">Unmapped</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">
                          {mapping?.fallback ? `"${mapping.fallback}"` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{t('scheduleSend.sending')}</p>
            </div>
            <span className="text-xs font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('scheduleSend.saveDraft')}
            </Button>
          )}

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogTrigger
              render={
                <Button
                  disabled={!name.trim() || isProcessing}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-md"
                />
              }
            >
              <Send className="h-4 w-4" />
              {t('scheduleSend.sendNow')}
            </DialogTrigger>
            <DialogContent className="border-border bg-popover sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-popover-foreground">{t('scheduleSend.confirmTitle')}</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {t.rich('scheduleSend.confirmDesc', {
                    count: estimatedReach,
                    template: template.name,
                    b: (chunks) => (
                      <span className="font-medium text-popover-foreground">{chunks}</span>
                    ),
                  })}
                </DialogDescription>
              </DialogHeader>

              {/* Extra check details in confirm modal */}
              <div className="my-2 p-3 rounded-lg border border-border bg-card/60 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Broadcast Name:</span>
                  <span className="font-medium text-foreground">{name}</span>
                </div>
                {headerMediaUrl && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Header Media:</span>
                    <span className="font-medium text-emerald-400">Attached ({template.header_type})</span>
                  </div>
                )}
                {uniqueVars.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Variables:</span>
                    <span className="font-medium text-foreground">{uniqueVars.length} mapped</span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="border-border text-muted-foreground"
                >
                  {t('cancel')}
                </Button>
                <Button
                  onClick={() => {
                    setShowConfirm(false);
                    onSend();
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" />
                  {t('scheduleSend.sendNow')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

