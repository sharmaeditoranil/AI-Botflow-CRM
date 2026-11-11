"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AccountTag {
  id: string;
  name: string;
  color?: string | null;
}

// One load shared by every caller on the page — the flow canvas renders a
// card per node, and each would otherwise fetch the same list. RLS scopes
// `tags` to the signed-in member's account.
let cache: AccountTag[] | null = null;
let cachedAt = 0;
const FRESH_MS = 30_000;
let inflight: Promise<AccountTag[]> | null = null;
const listeners = new Set<(tags: AccountTag[]) => void>();

function loadTags(): Promise<AccountTag[]> {
  // Re-read after a while so a tag created in Settings shows up here.
  if (cache && Date.now() - cachedAt < FRESH_MS) return Promise.resolve(cache);
  if (!inflight) {
    inflight = Promise.resolve(
      createClient().from("tags").select("id, name, color").order("name"),
    )
      .then(({ data }) => {
        cache = (data ?? []) as AccountTag[];
        cachedAt = Date.now();
        listeners.forEach((fn) => fn(cache!));
        return cache;
      })
      .catch(() => cache ?? [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The account's tags, sorted by name. `loading` until the first load lands. */
export function useAccountTags(): { tags: AccountTag[]; loading: boolean } {
  const [tags, setTags] = useState<AccountTag[] | null>(cache);

  useEffect(() => {
    listeners.add(setTags);
    void loadTags().then(setTags);
    return () => {
      listeners.delete(setTags);
    };
  }, []);

  return { tags: tags ?? [], loading: tags === null };
}
