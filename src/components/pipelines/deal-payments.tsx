"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IndianRupee, Loader2, Plus, Trash2, Wallet, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/currency";
import {
  PAYMENT_METHODS,
  parseAmount,
  summarizePayments,
  type DealPayment,
  type PaymentMethod,
} from "@/lib/pipelines/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DealPaymentsProps {
  /** Unsaved deals have no id yet — payments come after the first save. */
  dealId: string | null;
  /** The value typed in the form, so "Due" follows edits live. */
  dealValue: number;
  currency: string;
  canEdit: boolean;
  /** Fired with the new received total after a payment is added/removed. */
  onChanged?: (received: number) => void;
}

const STATUS_STYLES = {
  none: "bg-muted text-muted-foreground",
  unpaid: "bg-red-500/15 text-red-600 dark:text-red-400",
  partial: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  overpaid: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
} as const;

function localToday(): string {
  // en-CA formats as YYYY-MM-DD in the browser's own timezone.
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Deal → Payments (migration 059): received vs due, a progress bar, the
 * payment history, and a one-line form to record a payment.
 */
export function DealPayments({ dealId, dealValue, currency, canEdit, onChanged }: DealPaymentsProps) {
  const t = useTranslations("Pipelines.payments");
  const [payments, setPayments] = useState<DealPayment[]>([]);
  const [loading, setLoading] = useState(!!dealId);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(localToday);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [note, setNote] = useState("");

  // Mounted per deal (keyed by id), so this loads once.
  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    createClient()
      .from("deal_payments")
      .select("id, deal_id, amount, paid_on, method, note, created_at")
      .eq("deal_id", dealId)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          toast.error(t("loadFailed"));
          return;
        }
        setPayments(((data ?? []) as DealPayment[]).map((p) => ({ ...p, amount: Number(p.amount) })));
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, t]);

  const received = payments.reduce((sum, p) => sum + p.amount, 0);
  const summary = summarizePayments(dealValue, received);
  const money = (n: number) => formatCurrency(n, currency);

  function resetForm() {
    setAmount("");
    setPaidOn(localToday());
    setMethod("upi");
    setNote("");
    setAdding(false);
  }

  async function addPayment() {
    if (!dealId) return;
    const value = parseAmount(amount);
    if (value === null) {
      toast.error(t("invalidAmount"));
      return;
    }
    setSaving(true);
    // account_id is filled from the deal by a DB trigger.
    const { data, error } = await createClient()
      .from("deal_payments")
      .insert({
        deal_id: dealId,
        amount: value,
        paid_on: paidOn || localToday(),
        method,
        note: note.trim() || null,
      })
      .select("id, deal_id, amount, paid_on, method, note, created_at")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(t("saveFailed"));
      return;
    }
    const next = [{ ...(data as DealPayment), amount: Number(data.amount) }, ...payments].sort(
      (a, b) => b.paid_on.localeCompare(a.paid_on) || b.created_at.localeCompare(a.created_at),
    );
    setPayments(next);
    onChanged?.(next.reduce((s, p) => s + p.amount, 0));
    toast.success(t("saved", { amount: money(value) }));
    resetForm();
  }

  async function removePayment(p: DealPayment) {
    if (!confirm(t("removeConfirm", { amount: money(p.amount) }))) return;
    setDeletingId(p.id);
    const { error } = await createClient().from("deal_payments").delete().eq("id", p.id);
    setDeletingId(null);
    if (error) {
      toast.error(t("removeFailed"));
      return;
    }
    const next = payments.filter((x) => x.id !== p.id);
    setPayments(next);
    onChanged?.(next.reduce((s, x) => s + x.amount, 0));
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-card/60 p-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">{t("title")}</span>
          {dealId && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[summary.status])}>
              {t(`status.${summary.status}`)}
            </span>
          )}
        </div>
        {dealId && canEdit && !adding && (
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("add")}
          </Button>
        )}
      </div>

      {!dealId ? (
        <p className="rounded-lg border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
          {t("saveFirst")}
        </p>
      ) : (
        <>
          {/* Total / Received / Due */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("total")}</p>
              <p className="truncate text-sm font-bold text-foreground">{summary.total > 0 ? money(summary.total) : "—"}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                {t("received")}
              </p>
              <p className="truncate text-sm font-bold text-emerald-700 dark:text-emerald-400">{money(summary.received)}</p>
            </div>
            <div className={cn("rounded-lg p-2", summary.due > 0 ? "bg-red-500/10" : "bg-muted/50")}>
              <p
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide",
                  summary.due > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                )}
              >
                {t("due")}
              </p>
              <p
                className={cn(
                  "truncate text-sm font-bold",
                  summary.due > 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
                )}
              >
                {money(summary.due)}
              </p>
            </div>
          </div>

          {summary.total > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={t("progress", { percent: summary.percent })}>
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                style={{ width: `${summary.percent}%` }}
              />
            </div>
          )}
          {summary.total === 0 && <p className="text-[11px] text-muted-foreground">{t("setValueHint")}</p>}
          {summary.extra > 0 && summary.total > 0 && (
            <p className="text-[11px] text-sky-600 dark:text-sky-400">{t("extraHint", { amount: money(summary.extra) })}</p>
          )}

          {/* Add payment */}
          {adding && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <IndianRupee className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    inputMode="decimal"
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={summary.due > 0 ? String(summary.due) : t("amount")}
                    aria-label={t("amount")}
                    className="h-8 border-border bg-background pl-7 text-sm text-foreground"
                  />
                </div>
                <Input
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                  aria-label={t("date")}
                  className="h-8 border-border bg-background text-sm text-foreground"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                      method === m
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`method.${m}`)}
                  </button>
                ))}
              </div>
              <Input
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                className="h-8 border-border bg-background text-sm text-foreground"
              />
              <div className="flex items-center justify-between gap-2">
                {summary.due > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAmount(String(summary.due))}
                    className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    {t("fillDue", { amount: money(summary.due) })}
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={resetForm}>
                    <X className="h-3.5 w-3.5" />
                    {t("cancel")}
                  </Button>
                  <Button type="button" size="sm" className="h-7 px-3 text-xs" onClick={addPayment} disabled={saving}>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t("save")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length > 0 ? (
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">+{money(p.amount)}</span>
                      <span className="rounded bg-background px-1.5 py-px text-[10px] text-muted-foreground">
                        {t(`method.${p.method}`)}
                      </span>
                    </div>
                    {p.note && <p className="truncate text-[11px] text-muted-foreground">{p.note}</p>}
                  </div>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">
                    {new Date(`${p.paid_on}T00:00:00`).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {canEdit &&
                    (deletingId === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => removePayment(p)}
                        title={t("remove")}
                        aria-label={t("remove")}
                        className="text-muted-foreground transition-colors hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ))}
                </div>
              ))}
            </div>
          ) : (
            !adding && <p className="text-center text-[11px] text-muted-foreground">{t("empty")}</p>
          )}
        </>
      )}
    </div>
  );
}
