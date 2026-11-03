// ------------------------------------------------------------
// Deal payments (migration 059): what was received against a deal
// and what is still due.
// ------------------------------------------------------------

export const PAYMENT_METHODS = ["upi", "cash", "bank", "card", "cheque", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface DealPayment {
  id: string;
  deal_id: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  note: string | null;
  created_at: string;
}

export type PaymentStatus = "none" | "unpaid" | "partial" | "paid" | "overpaid";

export interface PaymentSummary {
  total: number;
  received: number;
  /** Never negative; see `extra` for anything paid beyond the value. */
  due: number;
  extra: number;
  /** 0–100, for the progress bar. */
  percent: number;
  status: PaymentStatus;
}

export function summarizePayments(dealValue: number | null | undefined, received: number): PaymentSummary {
  const total = Math.max(0, Number(dealValue) || 0);
  const paid = Math.max(0, Number(received) || 0);
  const due = Math.max(0, total - paid);
  const extra = Math.max(0, paid - total);
  let status: PaymentStatus;
  // No total yet: nothing to compare against.
  if (total === 0) status = "none";
  else if (paid === 0) status = "unpaid";
  else if (paid < total) status = "partial";
  else if (paid === total) status = "paid";
  else status = "overpaid";
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : paid > 0 ? 100 : 0;
  return { total, received: paid, due, extra, percent, status };
}

/** Parse a typed amount ("5,000", "2500.50"); null when not a positive number. */
export function parseAmount(input: string): number | null {
  const n = Number(input.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
