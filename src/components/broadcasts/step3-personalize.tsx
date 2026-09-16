'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Contact, CustomField, MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  ImageIcon,
  Loader2,
  Upload,
  Video,
  FileText,
  Trash2,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Phone,
  BookmarkCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import {
  MEDIA_HEADER_SPECS,
  type MediaHeaderKind,
} from '@/lib/whatsapp/media-header-types';

type VariableType = 'static' | 'field' | 'custom_field' | 'date';

export interface VariableMapping {
  type: VariableType;
  value: string;
  fallback?: string;
  dateFormat?: string;
}

interface Step3Props {
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  onUpdate: (variables: Record<string, VariableMapping>) => void;
  /** Media URL for an IMAGE/VIDEO/DOCUMENT header, when the template has one. */
  headerMediaUrl: string;
  onHeaderMediaUrlChange: (url: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;
type MediaHeaderType = (typeof MEDIA_HEADER_TYPES)[number];

function isMediaHeaderType(value: unknown): value is MediaHeaderType {
  return MEDIA_HEADER_TYPES.includes(value as MediaHeaderType);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const contactFields = [
  { value: 'name', labelKey: 'name' },
  { value: 'first_name', labelKey: 'first_name' },
  { value: 'phone', labelKey: 'phone' },
  { value: 'email', labelKey: 'email' },
  { value: 'company', labelKey: 'company' },
];

const dateFields = [
  { value: 'today', labelKey: 'today' },
  { value: 'today_iso', labelKey: 'today_iso' },
];

const SAMPLE_CONTACT: Contact = {
  id: 'sample',
  user_id: '',
  account_id: '',
  name: 'Rahul Sharma',
  phone: '+919876543210',
  email: 'rahul@example.com',
  company: 'Sharma Enterprises',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function Step3Personalize({
  template,
  variables,
  onUpdate,
  headerMediaUrl,
  onHeaderMediaUrlChange,
  onNext,
  onBack,
}: Step3Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [firstContact, setFirstContact] = useState<Contact | null>(null);
  const [firstContactCustomValues, setFirstContactCustomValues] = useState<
    Map<string, string>
  >(new Map());
  const [loadingPreview, setLoadingPreview] = useState(true);

  // Header media direct upload state
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileSize, setUploadedFileSize] = useState<number | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [savingAsDefault, setSavingAsDefault] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load user's custom fields + representative contact
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [fieldsRes, contactRes] = await Promise.all([
        supabase.from('custom_fields').select('*').order('field_name'),
        supabase
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      setCustomFields(fieldsRes.data ?? []);
      setLoadingFields(false);

      const contact = contactRes.data ?? null;
      setFirstContact(contact);

      if (contact) {
        const { data: customVals } = await supabase
          .from('contact_custom_values')
          .select('custom_field_id, value')
          .eq('contact_id', contact.id);
        if (!cancelled) {
          const map = new Map<string, string>();
          for (const row of customVals ?? []) {
            map.set(row.custom_field_id, row.value ?? '');
          }
          setFirstContactCustomValues(map);
        }
      }
      setLoadingPreview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const placeholders = useMemo(() => {
    const matches = template.body_text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)].sort((a, b) => {
      const numA = Number(a.replace(/\D/g, ''));
      const numB = Number(b.replace(/\D/g, ''));
      return numA - numB;
    });
  }, [template.body_text]);

  const mediaHeaderType = isMediaHeaderType(template.header_type)
    ? template.header_type
    : null;

  // Auto-populate default mappings from template.variable_mapping if available
  useEffect(() => {
    if (!template?.variable_mapping) return;
    const defaults: Record<string, VariableMapping> = {};
    for (const [key, conf] of Object.entries(template.variable_mapping)) {
      if (!variables[key] || !variables[key]?.value) {
        defaults[key] = {
          type: conf.type as VariableType,
          value: conf.value,
          fallback: conf.fallback,
          dateFormat: conf.dateFormat,
        };
      }
    }
    if (Object.keys(defaults).length > 0) {
      onUpdate({ ...variables, ...defaults });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  // Seed headerMediaUrl from template's stored header_media_url if not set
  useEffect(() => {
    if (mediaHeaderType && !headerMediaUrl && template.header_media_url) {
      onHeaderMediaUrlChange(template.header_media_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaHeaderType, template.header_media_url]);

  const headerMediaError = useMemo<'missing' | 'invalid' | null>(() => {
    if (!mediaHeaderType) return null;
    const value = headerMediaUrl.trim();
    if (!value) return 'missing';
    if (!isValidHttpUrl(value)) return 'invalid';
    return null;
  }, [mediaHeaderType, headerMediaUrl]);

  /** Direct media file upload handler */
  async function handleMediaUpload(file: File) {
    if (!mediaHeaderType) return;
    const maxBytes = MEDIA_MAX_BYTES_BY_KIND[mediaHeaderType];
    if (file.size > maxBytes) {
      toast.error(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
      return;
    }

    setUploadingMedia(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      onHeaderMediaUrlChange(publicUrl);
      setUploadedFileName(file.name);
      setUploadedFileSize(file.size);
      toast.success(
        mediaHeaderType === 'image'
          ? 'Image uploaded successfully!'
          : mediaHeaderType === 'video'
            ? 'Video uploaded successfully!'
            : 'Document uploaded successfully!',
      );
    } catch (err) {
      console.error('Header media upload error:', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingMedia(false);
    }
  }

  /** Save current wizard mappings as template default */
  async function handleSaveAsDefault() {
    try {
      setSavingAsDefault(true);
      const payloadMappings: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(variables)) {
        if (v.value?.trim()) {
          payloadMappings[k] = {
            type: v.type,
            value: v.value,
            fallback: v.fallback,
            dateFormat: v.dateFormat,
          };
        }
      }

      const res = await fetch(`/api/whatsapp/templates/${template.id}/mapping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable_mapping: payloadMappings }),
      });

      if (!res.ok) {
        throw new Error('Failed to update template defaults');
      }

      toast.success(t('personalize.mappingSavedDefault'));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save template defaults',
      );
    } finally {
      setSavingAsDefault(false);
    }
  }

  /** Missing required placeholder values */
  const unmappedKeys = useMemo(() => {
    const missing: string[] = [];
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      if (!mapping || (!mapping.value?.trim() && !mapping.fallback?.trim())) {
        missing.push(placeholder);
      }
    }
    return missing;
  }, [placeholders, variables]);

  function updateVariable(key: string, patch: Partial<VariableMapping>) {
    const current = variables[key] ?? {
      type: 'field' as VariableType,
      value: 'name',
    };
    onUpdate({
      ...variables,
      [key]: { ...current, ...patch },
    });
  }

  /** Formatted live preview string using actual or sample contact data */
  const previewText = useMemo(() => {
    const contact = firstContact ?? SAMPLE_CONTACT;
    const customValues = firstContact
      ? firstContactCustomValues
      : new Map<string, string>();

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const todayFormatted = `${day}/${month}/${now.getFullYear()}`;
    const todayIso = now.toISOString().split('T')[0];

    let text = template.body_text;
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      let replacement = placeholder;

      if (mapping) {
        if (mapping.type === 'static' && mapping.value) {
          replacement = mapping.value;
        } else if (mapping.type === 'date') {
          replacement =
            mapping.dateFormat === 'YYYY-MM-DD' ||
            mapping.value === 'today_iso'
              ? todayIso
              : todayFormatted;
        } else if (mapping.type === 'field' && mapping.value) {
          const rawName = contact.name ? contact.name.trim() : '';
          const firstName = rawName ? rawName.split(/\s+/)[0] : '';
          const fieldMap: Record<string, string | undefined> = {
            name: rawName,
            first_name: firstName,
            phone: contact.phone,
            email: contact.email,
            company: contact.company,
          };
          replacement = fieldMap[mapping.value] || mapping.fallback || placeholder;
        } else if (mapping.type === 'custom_field' && mapping.value) {
          replacement =
            customValues.get(mapping.value) || mapping.fallback || placeholder;
        }
      }
      text = text.replaceAll(placeholder, replacement);
    }
    return text;
  }, [
    template.body_text,
    variables,
    placeholders,
    firstContact,
    firstContactCustomValues,
  ]);

  const previewLabel = firstContact
    ? firstContact.name || firstContact.phone
    : t('personalize.previewSample');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t('personalize.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('personalize.subtitle')}
        </p>
      </div>

      {/* Media Header Section (Upload File or Enter URL) */}
      {mediaHeaderType && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mediaHeaderType === 'image' && (
                <ImageIcon className="h-4 w-4 text-purple-400" />
              )}
              {mediaHeaderType === 'video' && (
                <Video className="h-4 w-4 text-blue-400" />
              )}
              {mediaHeaderType === 'document' && (
                <FileText className="h-4 w-4 text-amber-400" />
              )}
              <p className="text-sm font-semibold text-foreground">
                {mediaHeaderType === 'image' &&
                  t('personalize.headerImage')}
                {mediaHeaderType === 'video' &&
                  t('personalize.headerVideo')}
                {mediaHeaderType === 'document' &&
                  t('personalize.headerDocument')}
              </p>
              <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                {mediaHeaderType}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="text-xs text-muted-foreground hover:text-foreground h-7"
            >
              {showUrlInput ? 'Switch to File Upload' : t('personalize.useUrlInstead')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {mediaHeaderType === 'image' && t('personalize.headerImageDesc')}
            {mediaHeaderType === 'video' && t('personalize.headerVideoDesc')}
            {mediaHeaderType === 'document' && t('personalize.headerDocumentDesc')}
          </p>

          {!showUrlInput ? (
            <div className="space-y-3">
              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  mediaHeaderType === 'image'
                    ? 'image/jpeg,image/png'
                    : mediaHeaderType === 'video'
                      ? 'video/mp4,video/3gpp'
                      : 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'
                }
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleMediaUpload(f);
                  e.target.value = '';
                }}
              />

              {/* Upload Dropzone / Button */}
              {!headerMediaUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleMediaUpload(f);
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    {uploadingMedia ? (
                      <Loader2 className="size-8 animate-spin text-primary" />
                    ) : mediaHeaderType === 'image' ? (
                      <ImageIcon className="size-8 text-muted-foreground" />
                    ) : mediaHeaderType === 'video' ? (
                      <Video className="size-8 text-muted-foreground" />
                    ) : (
                      <FileText className="size-8 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {uploadingMedia
                        ? t('personalize.uploadingMedia')
                        : mediaHeaderType === 'image'
                          ? t('personalize.uploadImageAction')
                          : mediaHeaderType === 'video'
                            ? t('personalize.uploadVideoAction')
                            : t('personalize.uploadDocumentAction')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {mediaHeaderType === 'image' && t('personalize.dragDropImage')}
                      {mediaHeaderType === 'video' && t('personalize.dragDropVideo')}
                      {mediaHeaderType === 'document' && t('personalize.dragDropDocument')}
                    </span>
                  </div>
                </div>
              ) : (
                /* Uploaded Media State with Actions */
                <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">
                        {uploadedFileName || `${mediaHeaderType.toUpperCase()} file attached`}
                      </span>
                      {uploadedFileSize && (
                        <span className="text-[10px] text-muted-foreground">
                          ({(uploadedFileSize / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingMedia}
                        className="h-7 text-xs"
                      >
                        <Upload className="size-3 mr-1" />
                        {t('personalize.changeFile')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          onHeaderMediaUrlChange('');
                          setUploadedFileName('');
                          setUploadedFileSize(null);
                        }}
                        className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-950/20"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Visual Previews */}
                  {mediaHeaderType === 'image' && (
                    <div className="relative rounded-lg overflow-hidden border border-border bg-black/40 max-h-48 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={headerMediaUrl}
                        alt="Header preview"
                        className="max-h-48 w-full object-contain"
                      />
                    </div>
                  )}

                  {mediaHeaderType === 'video' && (
                    <div className="rounded-lg overflow-hidden border border-border bg-black max-h-48">
                      <video
                        controls
                        src={headerMediaUrl}
                        className="max-h-48 w-full object-contain"
                      />
                    </div>
                  )}

                  {mediaHeaderType === 'document' && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/60">
                      <FileText className="size-8 text-amber-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">
                          {uploadedFileName || 'Attached Document'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Document will be sent with the WhatsApp message
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* External URL Input Option */
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground">
                {t('personalize.imageUrl')}
              </label>
              <Input
                type="url"
                value={headerMediaUrl}
                onChange={(e) => onHeaderMediaUrlChange(e.target.value)}
                placeholder={t('personalize.imageUrlPlaceholder')}
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
              />
              {headerMediaError && (
                <p className="text-xs text-amber-300">
                  {headerMediaError === 'missing'
                    ? t('personalize.mediaUrlRequired')
                    : t('personalize.mediaUrlInvalid')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Variables Personalization Section */}
      {placeholders.length === 0 && !mediaHeaderType ? (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t('personalize.noPreview')}
          </p>
        </div>
      ) : placeholders.length === 0 ? null : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Template Variables ({placeholders.length})
              </h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveAsDefault}
              disabled={savingAsDefault}
              className="text-xs h-7 border-border hover:bg-muted"
            >
              {savingAsDefault ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : (
                <BookmarkCheck className="size-3 mr-1 text-primary" />
              )}
              {t('personalize.saveAsTemplateDefault')}
            </Button>
          </div>

          {placeholders.map((placeholder) => {
            const key = placeholder.replace(/^\{\{|\}\}$/g, '');
            const mapping = variables[key] ?? {
              type: 'field',
              value: 'name',
              fallback: '',
            };

            return (
              <div
                key={placeholder}
                className="rounded-xl border border-border bg-card/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-mono">
                    {placeholder}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Variable #{key}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* Variable Type Selector */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t('personalize.type')}
                    </label>
                    <Select
                      value={mapping.type}
                      onValueChange={(val) =>
                        updateVariable(key, {
                          type: val as VariableType,
                          value:
                            val === 'field'
                              ? 'name'
                              : val === 'date'
                                ? 'today'
                                : '',
                        })
                      }
                    >
                      <SelectTrigger className="w-full border-border bg-muted text-foreground text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="field">
                          {t('personalize.typeContact')}
                        </SelectItem>
                        <SelectItem value="date">
                          {t('personalize.typeDate')}
                        </SelectItem>
                        <SelectItem value="custom_field">
                          {t('personalize.typeCustom')}
                        </SelectItem>
                        <SelectItem value="static">
                          {t('personalize.typeStatic')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target Field / Value Selector */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {mapping.type === 'static'
                        ? t('personalize.staticValue')
                        : mapping.type === 'date'
                          ? "Date Format"
                          : t('personalize.contactField')}
                    </label>

                    {mapping.type === 'static' ? (
                      <Input
                        value={mapping.value}
                        onChange={(e) =>
                          updateVariable(key, { value: e.target.value })
                        }
                        placeholder={t('personalize.enterValue')}
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground text-xs h-9"
                      />
                    ) : mapping.type === 'date' ? (
                      <Select
                        value={mapping.value || 'today'}
                        onValueChange={(val) =>
                          updateVariable(key, {
                            value: val,
                            dateFormat:
                              val === 'today_iso' ? 'YYYY-MM-DD' : 'DD/MM/YYYY',
                          })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground text-xs h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {dateFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {t(`personalize.fieldMap.${field.labelKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : mapping.type === 'field' ? (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) =>
                          updateVariable(key, {
                            value: val || '',
                            fallback:
                              val === 'name' || val === 'first_name'
                                ? 'Customer'
                                : '',
                          })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground text-xs h-9">
                          <SelectValue
                            placeholder={t('personalize.selectContactField')}
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {contactFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {t(`personalize.fieldMap.${field.labelKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground text-xs h-9">
                          <SelectValue
                            placeholder={
                              loadingFields
                                ? t('personalize.loadingFields')
                                : customFields.length === 0
                                  ? t('personalize.noCustomFields')
                                  : t('personalize.selectCustomField')
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {customFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Fallback Value Input */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t('personalize.fallback')}
                    </label>
                    <Input
                      value={mapping.fallback ?? ''}
                      onChange={(e) =>
                        updateVariable(key, { fallback: e.target.value })
                      }
                      placeholder={t('personalize.fallbackPlaceholder')}
                      className="border-border bg-muted text-foreground placeholder:text-muted-foreground text-xs h-9"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live WhatsApp Message Bubble Preview */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {t('personalize.preview')}
            </p>
            <span className="text-xs text-muted-foreground">
              ({previewLabel})
            </span>
          </div>
          {loadingPreview && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
        </div>

        {/* WhatsApp Chat Environment */}
        <div className="rounded-xl bg-[#0b141a] p-4 border border-border/80">
          <div className="ml-auto max-w-[85%] rounded-lg bg-[#005c4b] shadow-md text-white overflow-hidden">
            {/* Header Media in Preview Bubble */}
            {mediaHeaderType === 'image' && headerMediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerMediaUrl}
                alt="Header Preview"
                className="w-full max-h-48 object-cover"
              />
            )}
            {mediaHeaderType === 'video' && headerMediaUrl && (
              <video
                controls
                src={headerMediaUrl}
                className="w-full max-h-48 object-cover bg-black"
              />
            )}
            {mediaHeaderType === 'document' && headerMediaUrl && (
              <div className="flex items-center gap-2.5 p-3 bg-black/25 border-b border-white/10">
                <FileText className="size-7 text-amber-300 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {uploadedFileName || 'Document.pdf'}
                  </p>
                  <p className="text-[10px] text-white/70">PDF Attachment</p>
                </div>
              </div>
            )}

            {/* Body Content */}
            <div className="p-3 space-y-1.5">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-white">
                {previewText}
              </p>
              {template.footer_text && (
                <p className="text-[10px] text-white/60 italic pt-0.5">
                  {template.footer_text}
                </p>
              )}
              <div className="flex items-center justify-end gap-1 text-[9px] text-white/60 pt-0.5">
                <span>12:00 PM</span>
                <CheckCircle2 className="size-3 text-[#53bdeb]" />
              </div>
            </div>

            {/* Template Buttons in Preview Bubble */}
            {template.buttons && template.buttons.length > 0 && (
              <div className="border-t border-white/10 divide-y divide-white/10 bg-black/10">
                {template.buttons.map((btn, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-center gap-1.5 py-2 text-center text-xs font-medium text-[#53bdeb]"
                  >
                    {btn.type === 'URL' && <ExternalLink className="size-3" />}
                    {btn.type === 'PHONE_NUMBER' && <Phone className="size-3" />}
                    <span>{btn.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {unmappedKeys.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {t.rich('personalize.unmappedWarning', {
            keys: unmappedKeys.join(', '),
            mono: (chunks) => (
              <span className="font-mono font-semibold">{chunks}</span>
            ),
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={unmappedKeys.length > 0 || headerMediaError !== null}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
