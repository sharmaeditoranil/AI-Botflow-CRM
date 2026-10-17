'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, Loader2, Plus, Star, Trash2, Pencil, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWhatsAppNumbers, numberName, type WhatsAppNumberSummary } from '@/hooks/use-whatsapp-numbers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';
import { WhatsAppConfig } from './whatsapp-config';
import { WhatsAppIcon } from '@/components/icons/social-icons';

/**
 * Settings → WhatsApp (migration 057): the account's WhatsApp numbers
 * and, below, the full connection form for the one being edited.
 *
 * With no number yet this is the familiar first-time setup form. With
 * one or more, a compact list sits on top: each number's name, phone,
 * status and default flag, plus Add / Edit / Make default / Remove.
 * Adding stops at the plan's limit with an upgrade hint.
 */
export function WhatsAppNumbers() {
  const t = useTranslations('Settings.whatsappNumbers');
  const tw = useTranslations('Settings.whatsapp');
  const { canEditSettings } = useAuth();
  const { numbers, limit, can_add, loading, refresh, defaultNumber } = useWhatsAppNumbers();

  // Number being edited: an id, 'new', or null → the default number.
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const editing: string | 'new' | null =
    selected === 'new'
      ? 'new'
      : selected && numbers.some((n) => n.id === selected)
        ? selected
        : numbers.length === 0
          ? 'new'
          : (defaultNumber?.id ?? null);

  const editingNumber = editing && editing !== 'new' ? numbers.find((n) => n.id === editing) : null;

  async function makeDefault(n: WhatsAppNumberSummary) {
    setBusyId(n.id);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id, is_default: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refresh();
      toast.success(t('defaultSet', { name: numberName(n) }));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('actionFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(n: WhatsAppNumberSummary) {
    if (!confirm(t('removeConfirm', { name: numberName(n) }))) return;
    setBusyId(n.id);
    try {
      const res = await fetch(`/api/whatsapp/config?number_id=${encodeURIComponent(n.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json()).error);
      if (selected === n.id) setSelected(null);
      await refresh();
      toast.success(t('removed', { name: numberName(n) }));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('actionFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="animate-in fade-in-50 duration-200 space-y-6">
      <SettingsPanelHead title={tw('title')} description={tw('description')} />

      {numbers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-foreground">{t('title')}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t('usage', { count: numbers.length, limit })}
              </CardDescription>
            </div>
            {canEditSettings &&
              (can_add ? (
                <Button size="sm" onClick={() => setSelected('new')} disabled={editing === 'new'}>
                  <Plus className="size-4" />
                  {t('add')}
                </Button>
              ) : (
                <Link
                  href="/upgrade"
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  {t('limitReached')}
                </Link>
              ))}
          </CardHeader>
          <CardContent className="space-y-2">
            {numbers.map((n) => {
              const live = n.status === 'connected' && !n.last_registration_error;
              const isEditing = editing === n.id;
              return (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    isEditing ? 'border-primary/50 bg-primary/5' : 'border-border',
                  )}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]">
                    <WhatsAppIcon className="size-4 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {n.label?.trim() || n.display_phone_number || numberName(n)}
                      </span>
                      {n.is_default && (
                        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {t('default')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {n.label?.trim() && n.display_phone_number && (
                        <>
                          <span className="font-medium text-foreground/80">{n.display_phone_number}</span>
                          <span className="text-border">•</span>
                        </>
                      )}
                      {live ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" />
                          {t('live')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-3" />
                          {t('needsAttention')}
                        </span>
                      )}
                      {!n.label?.trim() && canEditSettings && (
                        <>
                          <span className="text-border">•</span>
                          <button
                            type="button"
                            onClick={() => setSelected(n.id)}
                            className="text-primary hover:underline"
                          >
                            {t('addName')}
                          </button>
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                      {t('phoneId', { id: n.phone_number_id })}
                    </p>
                  </div>
                  {canEditSettings && (
                    <div className="flex shrink-0 items-center gap-1">
                      {busyId === n.id ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t('edit')}
                            aria-label={t('edit')}
                            onClick={() => setSelected(n.id)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          {!n.is_default && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t('makeDefault')}
                              aria-label={t('makeDefault')}
                              onClick={() => makeDefault(n)}
                            >
                              <Star className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t('remove')}
                            aria-label={t('remove')}
                            onClick={() => remove(n)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {numbers.length > 1 && (
              <p className="pt-1 text-xs text-muted-foreground">{t('defaultHint')}</p>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && editing && (
        <div className="space-y-3">
          {numbers.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {editing === 'new'
                  ? t('addTitle')
                  : t('editTitle', { name: editingNumber ? numberName(editingNumber) : '' })}
              </h3>
              {editing === 'new' && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  <X className="size-4" />
                  {t('cancel')}
                </Button>
              )}
            </div>
          )}
          <WhatsAppConfig
            key={editing}
            embedded
            isNew={editing === 'new'}
            numberId={editing === 'new' ? null : editing}
            onSaved={async (id) => {
              const fresh = await refresh();
              if (editing === 'new') {
                setSelected(id ?? fresh.numbers[fresh.numbers.length - 1]?.id ?? null);
              }
            }}
            onRemoved={async () => {
              setSelected(null);
              await refresh();
            }}
          />
        </div>
      )}

      {loading && numbers.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      )}
    </section>
  );
}
