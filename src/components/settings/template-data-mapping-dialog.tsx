'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  CheckCircle2,
  Sparkles,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  CustomField,
  MessageTemplate,
  TemplateVariableMappingConfig,
  TemplateVariableSource,
} from '@/types';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';

interface TemplateDataMappingDialogProps {
  template: MessageTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customFields: CustomField[];
  onSaveSuccess: (updated: MessageTemplate) => void;
}

const SAMPLE_CONTACT = {
  name: 'Rahul Sharma',
  first_name: 'Rahul',
  phone: '+91 98765 43210',
  email: 'rahul@example.com',
  company: 'Sharma Enterprises',
};

export function TemplateDataMappingDialog({
  template,
  open,
  onOpenChange,
  customFields,
  onSaveSuccess,
}: TemplateDataMappingDialogProps) {
  const t = useTranslations('Settings.templates');
  const [saving, setSaving] = useState(false);
  const [mapping, setMapping] = useState<
    Record<string, TemplateVariableMappingConfig>
  >({});

  // Collect all variable indices in the template body (and text header)
  const bodyVariables = useMemo(() => {
    if (!template?.body_text) return [];
    return extractVariableIndices(template.body_text);
  }, [template?.body_text]);

  const headerVariableCount = useMemo(() => {
    if (template?.header_type === 'text' && template.header_content) {
      return extractVariableIndices(template.header_content).length;
    }
    return 0;
  }, [template?.header_type, template?.header_content]);

  // Initialize mapping from template or intelligent defaults
  useEffect(() => {
    if (!template || !open) return;

    const current = { ...(template.variable_mapping ?? {}) };

    // Auto-suggest for variables that have no mapping yet
    for (const v of bodyVariables) {
      const key = String(v);
      if (!current[key]) {
        // Variable 1 often represents customer name in WhatsApp templates
        if (v === 1) {
          current[key] = {
            type: 'field',
            value: 'name',
            fallback: 'Customer',
            label: 'Full Name',
          };
        } else {
          current[key] = {
            type: 'field',
            value: 'name',
            fallback: '',
            label: 'Full Name',
          };
        }
      }
    }

    if (headerVariableCount > 0 && !current['header']) {
      current['header'] = {
        type: 'field',
        value: 'name',
        fallback: 'Customer',
        label: 'Header Name',
      };
    }

    setMapping(current);
  }, [template, open, bodyVariables, headerVariableCount]);

  function updateVariable(
    key: string,
    patch: Partial<TemplateVariableMappingConfig>,
  ) {
    setMapping((prev) => {
      const existing = prev[key] ?? { type: 'field', value: 'name' };
      return {
        ...prev,
        [key]: { ...existing, ...patch },
      };
    });
  }

  // Live WhatsApp preview calculation
  const previewText = useMemo(() => {
    if (!template) return '';
    let text = template.body_text;
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const todayFormatted = `${day}/${month}/${now.getFullYear()}`;
    const todayIso = now.toISOString().split('T')[0];

    for (const v of bodyVariables) {
      const key = String(v);
      const conf = mapping[key];
      let resolved = `{{${v}}}`;

      if (conf) {
        if (conf.type === 'static') {
          resolved = conf.value || conf.fallback || `{{${v}}}`;
        } else if (conf.type === 'date') {
          resolved =
            conf.dateFormat === 'YYYY-MM-DD' || conf.value === 'today_iso'
              ? todayIso
              : todayFormatted;
        } else if (conf.type === 'field') {
          if (conf.value === 'first_name') resolved = SAMPLE_CONTACT.first_name;
          else if (conf.value === 'phone') resolved = SAMPLE_CONTACT.phone;
          else if (conf.value === 'email') resolved = SAMPLE_CONTACT.email;
          else if (conf.value === 'company') resolved = SAMPLE_CONTACT.company;
          else resolved = SAMPLE_CONTACT.name;
        } else if (conf.type === 'custom_field') {
          const field = customFields.find((f) => f.id === conf.value);
          resolved = field ? `[${field.field_name}]` : `{{${v}}}`;
        }
      }

      text = text.replaceAll(`{{${v}}}`, resolved);
    }
    return text;
  }, [template, bodyVariables, mapping, customFields]);

  async function handleSave() {
    if (!template) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/whatsapp/templates/${template.id}/mapping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable_mapping: mapping }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('mappingSaveFailed'));
      }

      toast.success(t('mappingSaved'));
      if (data.template) {
        onSaveSuccess(data.template);
      }
      onOpenChange(false);
    } catch (err) {
      console.error('Save mapping error:', err);
      toast.error(err instanceof Error ? err.message : t('mappingSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" />
            <DialogTitle className="text-popover-foreground">
              {t('dataMappingTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground">
            {t('dataMappingDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Template Info Card */}
          <div className="rounded-lg border border-border bg-card/60 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-foreground">
                {template.name}
              </span>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {template.language ?? 'en_US'}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {template.category}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {template.body_text}
            </p>
          </div>

          {/* Header Variable Mapping (if text header has variable) */}
          {headerVariableCount > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-primary/20 font-mono">
                    Header {'{{1}}'}
                  </Badge>
                  <span className="text-xs font-medium text-muted-foreground">
                    Header Variable
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select
                  value={mapping['header']?.value ?? 'name'}
                  onValueChange={(val) =>
                    updateVariable('header', { type: 'field', value: val ?? '' })
                  }
                >
                  <SelectTrigger className="bg-muted border-border text-foreground h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="name">{t('fieldFullName')}</SelectItem>
                    <SelectItem value="first_name">
                      {t('fieldFirstName')}
                    </SelectItem>
                    <SelectItem value="company">{t('fieldCompany')}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder={t('fallbackPlaceholder')}
                  value={mapping['header']?.fallback ?? ''}
                  onChange={(e) =>
                    updateVariable('header', { fallback: e.target.value })
                  }
                  className="bg-muted border-border text-foreground h-9"
                />
              </div>
            </div>
          )}

          {/* Body Variables Mapping Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" />
                Variables Mapping ({bodyVariables.length})
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Set source & fallback for each variable
              </span>
            </div>

            {bodyVariables.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {t('noVariables')} — this template has no dynamic placeholders.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bodyVariables.map((v) => {
                  const key = String(v);
                  const conf = mapping[key] ?? {
                    type: 'field',
                    value: 'name',
                    fallback: '',
                  };

                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-border bg-card/50 p-3.5 space-y-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-center justify-between">
                        <Badge className="bg-primary/10 text-primary border-primary/20 font-mono text-xs">
                          {`{{${v}}}`}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Placeholder #{v}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {/* Source Type Selector */}
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">
                            {t('mapSourceType')}
                          </Label>
                          <Select
                            value={conf.type}
                            onValueChange={(val) =>
                              updateVariable(key, {
                                type: val as TemplateVariableSource,
                                value:
                                  val === 'field'
                                    ? 'name'
                                    : val === 'date'
                                      ? 'today'
                                      : '',
                              })
                            }
                          >
                            <SelectTrigger className="bg-muted border-border text-foreground h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border">
                              <SelectItem value="field">
                                Contact Field
                              </SelectItem>
                              <SelectItem value="date">
                                Today&apos;s Date
                              </SelectItem>
                              <SelectItem value="custom_field">
                                Custom Field
                              </SelectItem>
                              <SelectItem value="static">
                                Static Text
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Value Selector / Input */}
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">
                            {t('mapCustomerField')}
                          </Label>
                          {conf.type === 'field' && (
                            <Select
                              value={conf.value || 'name'}
                              onValueChange={(val) =>
                                updateVariable(key, { value: val ?? '' })
                              }
                            >
                              <SelectTrigger className="bg-muted border-border text-foreground h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-popover border-border">
                                <SelectItem value="name">
                                  {t('fieldFullName')}
                                </SelectItem>
                                <SelectItem value="first_name">
                                  {t('fieldFirstName')}
                                </SelectItem>
                                <SelectItem value="phone">
                                  {t('fieldPhone')}
                                </SelectItem>
                                <SelectItem value="email">
                                  {t('fieldEmail')}
                                </SelectItem>
                                <SelectItem value="company">
                                  {t('fieldCompany')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}

                          {conf.type === 'date' && (
                            <Select
                              value={conf.value || 'today'}
                              onValueChange={(val) =>
                                updateVariable(key, {
                                  value: val ?? 'today',
                                  dateFormat:
                                    val === 'today_iso'
                                      ? 'YYYY-MM-DD'
                                      : 'DD/MM/YYYY',
                                })
                              }
                            >
                              <SelectTrigger className="bg-muted border-border text-foreground h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-popover border-border">
                                <SelectItem value="today">
                                  {t('fieldTodayDate')}
                                </SelectItem>
                                <SelectItem value="today_iso">
                                  {t('fieldTodayIso')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}

                          {conf.type === 'custom_field' && (
                            <Select
                              value={conf.value || undefined}
                              onValueChange={(val) =>
                                updateVariable(key, { value: val ?? '' })
                              }
                            >
                              <SelectTrigger className="bg-muted border-border text-foreground h-9 text-xs">
                                <SelectValue
                                  placeholder={
                                    customFields.length === 0
                                      ? 'No custom fields'
                                      : 'Select field…'
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent className="bg-popover border-border">
                                {customFields.map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.field_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {conf.type === 'static' && (
                            <Input
                              placeholder="e.g. 20% OFF"
                              value={conf.value}
                              onChange={(e) =>
                                updateVariable(key, { value: e.target.value })
                              }
                              className="bg-muted border-border text-foreground h-9 text-xs"
                            />
                          )}
                        </div>

                        {/* Fallback Input */}
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">
                            {t('fallbackValue')}
                          </Label>
                          <Input
                            placeholder={t('fallbackPlaceholder')}
                            value={conf.fallback ?? ''}
                            onChange={(e) =>
                              updateVariable(key, { fallback: e.target.value })
                            }
                            className="bg-muted border-border text-foreground h-9 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live WhatsApp Bubble Preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Eye className="size-3.5 text-primary" />
              <span>{t('previewTitle')}</span>
              <span className="text-[10px] text-muted-foreground/70 font-normal">
                (Sample Contact: Rahul Sharma)
              </span>
            </div>
            <div className="rounded-xl bg-[#0b141a] p-4 border border-border/60">
              <div className="ml-auto max-w-[90%] rounded-lg bg-[#005c4b] p-3 shadow-md text-white text-xs space-y-1.5">
                <p className="whitespace-pre-wrap leading-relaxed">
                  {previewText}
                </p>
                {template.footer_text && (
                  <p className="text-[10px] text-white/60 italic">
                    {template.footer_text}
                  </p>
                )}
                <div className="flex items-center justify-end gap-1 text-[9px] text-white/50 pt-0.5">
                  <span>12:00 PM</span>
                  <CheckCircle2 className="size-3 text-[#53bdeb]" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                {t('savingMapping')}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4 mr-1.5" />
                {t('saveMapping')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
