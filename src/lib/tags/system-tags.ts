import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag } from '@/types';

export const SYSTEM_DEFAULT_TAGS = [
  { name: 'Interested', color: '#10b981', is_system: true },
  { name: 'Not Interested', color: '#ef4444', is_system: true },
] as const;

/**
 * Checks if a tag is a protected system tag that AI or automations depend on.
 */
export function isSystemProtectedTag(
  tagNameOrTag: string | { name?: string; is_system?: boolean } | null | undefined
): boolean {
  if (!tagNameOrTag) return false;
  if (typeof tagNameOrTag === 'object' && tagNameOrTag.is_system) return true;
  const name = typeof tagNameOrTag === 'string' ? tagNameOrTag : tagNameOrTag.name || '';
  const n = name.toLowerCase().trim();
  return n === 'interested' || n === 'not interested';
}

/**
 * Ensures an account always has the core default tags ("Interested", "Not Interested").
 * If any are missing, they are created automatically with is_system=true.
 */
export async function ensureDefaultTagsForAccount(
  db: SupabaseClient,
  accountId: string,
  userId: string
): Promise<Tag[]> {
  if (!accountId) return [];
  try {
    const { data: existing } = await db
      .from('tags')
      .select('*')
      .eq('account_id', accountId);

    const existingTags = (existing as Tag[]) || [];
    const existingNames = new Set(existingTags.map((t) => t.name.toLowerCase().trim()));

    const missing = SYSTEM_DEFAULT_TAGS.filter((t) => !existingNames.has(t.name.toLowerCase()));

    if (missing.length > 0 && userId) {
      const inserts = missing.map((t) => ({
        account_id: accountId,
        user_id: userId,
        name: t.name,
        color: t.color,
      }));
      const { data: created } = await db.from('tags').insert(inserts).select('*');
      if (created) {
        return [...existingTags, ...(created as Tag[])];
      }
    }
    return existingTags;
  } catch (err) {
    console.warn('[system-tags] ensureDefaultTagsForAccount error:', err);
    return [];
  }
}
