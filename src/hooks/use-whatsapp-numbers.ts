"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The account's WhatsApp numbers (migration 057), from
 * GET /api/whatsapp/numbers. Shared by Settings → WhatsApp, inbox badges
 * and filters, and the broadcast sender picker.
 *
 * One in-flight request is shared by every component that mounts at the
 * same time, and the result is cached for the page's lifetime; call
 * `refresh()` after adding, renaming or removing a number.
 */
export interface WhatsAppNumberSummary {
  id: string;
  label: string | null;
  display_phone_number: string | null;
  phone_number_id: string;
  waba_id: string | null;
  status: "connected" | "disconnected";
  is_default: boolean;
  registered_at: string | null;
  last_registration_error: string | null;
  coexistence?: boolean;
  created_at: string;
}

interface NumbersPayload {
  numbers: WhatsAppNumberSummary[];
  limit: number;
  count: number;
  can_add: boolean;
}

const EMPTY: NumbersPayload = { numbers: [], limit: 1, count: 0, can_add: true };

let cache: NumbersPayload | null = null;
let inflight: Promise<NumbersPayload> | null = null;
const listeners = new Set<(p: NumbersPayload) => void>();

async function load(force = false): Promise<NumbersPayload> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = fetch("/api/whatsapp/numbers", { cache: "no-store" })
    .then(async (res) => (res.ok ? ((await res.json()) as NumbersPayload) : EMPTY))
    .catch(() => EMPTY)
    .then((payload) => {
      cache = payload;
      inflight = null;
      listeners.forEach((l) => l(payload));
      return payload;
    });
  return inflight;
}

export function useWhatsAppNumbers() {
  const [state, setState] = useState<NumbersPayload>(cache ?? EMPTY);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    const onChange = (p: NumbersPayload) => alive && setState(p);
    listeners.add(onChange);
    load().then((p) => {
      if (!alive) return;
      setState(p);
      setLoading(false);
    });
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const p = await load(true);
    setLoading(false);
    return p;
  }, []);

  const byId = useCallback(
    (id: string | null | undefined) =>
      id ? state.numbers.find((n) => n.id === id) ?? null : null,
    [state.numbers],
  );

  return {
    ...state,
    loading,
    refresh,
    byId,
    /** More than one number — only then do badges, filters and pickers show. */
    isMulti: state.numbers.length > 1,
    defaultNumber: state.numbers.find((n) => n.is_default) ?? state.numbers[0] ?? null,
  };
}

/** Short name for a number: label, else display number, else id tail. */
export { numberDisplayName as numberName } from "@/lib/whatsapp/numbers";
