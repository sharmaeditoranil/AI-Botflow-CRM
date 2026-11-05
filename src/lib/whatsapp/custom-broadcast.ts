import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate, TemplateButton } from '@/types';
import { fetchAllRows, fetchInChunks } from '@/lib/supabase/fetch-all';

export const CUSTOM_BROADCAST_TEMPLATE_NAME = '__custom_message__';

export interface CustomBroadcastConfig {
  bodyText: string;
  mediaType: 'none' | 'image' | 'video';
  mediaUrl?: string | null;
  footerText?: string | null;
  buttons?: TemplateButton[];
}

export function isCustomBroadcastTemplate(name?: string | null): boolean {
  return name === CUSTOM_BROADCAST_TEMPLATE_NAME;
}

export function formatBroadcastTemplateDisplayName(name?: string | null): string {
  if (!name) return '—';
  if (isCustomBroadcastTemplate(name)) {
    return 'Custom Message (24h / Web)';
  }
  return name;
}

export function templateFromCustomBroadcastConfig(
  config: CustomBroadcastConfig
): MessageTemplate {
  const mediaType =
    config.mediaType === 'image' || config.mediaType === 'video'
      ? config.mediaType
      : undefined;

  return {
    id: CUSTOM_BROADCAST_TEMPLATE_NAME,
    user_id: '',
    account_id: '',
    name: CUSTOM_BROADCAST_TEMPLATE_NAME,
    language: 'en_US',
    category: 'Utility',
    header_type: mediaType,
    header_media_url: config.mediaUrl?.trim() || undefined,
    body_text: config.bodyText || '',
    footer_text: config.footerText?.trim() || undefined,
    buttons: Array.isArray(config.buttons) ? config.buttons : [],
    status: 'APPROVED',
    created_at: new Date().toISOString(),
  };
}

export function customBroadcastConfigFromTemplate(
  template: MessageTemplate,
  headerMediaUrl?: string
): CustomBroadcastConfig {
  const mediaType =
    template.header_type === 'image' || template.header_type === 'video'
      ? template.header_type
      : 'none';

  return {
    bodyText: template.body_text || '',
    mediaType,
    mediaUrl: headerMediaUrl?.trim() || template.header_media_url?.trim() || null,
    footerText: template.footer_text?.trim() || null,
    buttons: Array.isArray(template.buttons) ? template.buttons : [],
  };
}

/**
 * Find all unique `contact_id`s that have an active conversation within the
 * last 24 hours (customer inbound message within 24h, or active thread within 24h).
 */
export async function fetchActive24hContactIds(
  supabase: SupabaseClient,
  accountId?: string | null
): Promise<string[]> {
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const contactIds = new Set<string>();

  try {
    // 1. Find conversations with an inbound customer message in the last 24h
    const recentCustomerMsgs = await fetchAllRows<{ conversation_id: string }>(
      (from, to) =>
        supabase
          .from('messages')
          .select('conversation_id')
          .eq('sender_type', 'customer')
          .gte('created_at', cutoffIso)
          .order('id')
          .range(from, to)
    );

    const convIds = [
      ...new Set(
        recentCustomerMsgs
          .map((m) => m.conversation_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    if (convIds.length > 0) {
      const convRows = await fetchInChunks<string, { contact_id: string }>(
        convIds,
        (ids) => {
          let q = supabase
            .from('conversations')
            .select('contact_id')
            .in('id', ids);
          if (accountId) q = q.eq('account_id', accountId);
          return q;
        }
      );
      for (const row of convRows) {
        if (row.contact_id) contactIds.add(row.contact_id);
      }
    }

    // 2. Also include conversations whose last_message_at is within 24h and unread_count > 0
    //    (or if no customer messages matched above, all conversations active in last 24h)
    const recentConvs = await fetchAllRows<{
      contact_id: string;
      unread_count?: number;
    }>((from, to) => {
      let q = supabase
        .from('conversations')
        .select('contact_id, unread_count')
        .gte('last_message_at', cutoffIso);
      if (accountId) q = q.eq('account_id', accountId);
      return q.order('id').range(from, to);
    });

    for (const c of recentConvs) {
      if (c.contact_id && (contactIds.size === 0 || (c.unread_count ?? 0) > 0)) {
        contactIds.add(c.contact_id);
      }
    }
  } catch (err) {
    console.warn('[fetchActive24hContactIds] warning:', err);
  }

  return [...contactIds];
}

