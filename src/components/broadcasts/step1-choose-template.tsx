'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
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
} from 'lucide-react';
import { useTranslations } from 'next-intl';

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
}

export function Step1ChooseTemplate({ selectedTemplate, onSelect, onNext, onBack }: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        // Only APPROVED templates can be sent via Meta — anything else
        // would 400 at broadcast time.
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
  }, []);

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchesSearch =
        !searchTerm.trim() ||
        tpl.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tpl.body_text && tpl.body_text.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCat =
        selectedCategory === 'ALL' ||
        tpl.category?.toUpperCase() === selectedCategory.toUpperCase();

      return matchesSearch && matchesCat;
    });
  }, [templates, searchTerm, selectedCategory]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((tpl) => {
      if (tpl.category) set.add(tpl.category.toUpperCase());
    });
    return ['ALL', ...Array.from(set)];
  }, [templates]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('chooseTemplate.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('chooseTemplate.subtitle')}
        </p>
      </div>

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
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-border bg-card/50">
          <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('chooseTemplate.noTemplates')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('chooseTemplate.createFirst')}</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30">
          <Search className="mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No approved templates found matching your search</p>
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
            const catColor = categoryColors[template.category] ?? categoryColors.Utility;

            // Variable analysis
            const varMatches = template.body_text?.match(/\{\{(\d+)\}\}/g) || [];
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
                      {template.header_type === 'image' && <ImageIcon className="h-3 w-3 text-emerald-400" />}
                      {template.header_type === 'video' && <Video className="h-3 w-3 text-blue-400" />}
                      {template.header_type === 'document' && <FileDown className="h-3 w-3 text-amber-400" />}
                      <span className="capitalize">{template.header_type} Header</span>
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

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

