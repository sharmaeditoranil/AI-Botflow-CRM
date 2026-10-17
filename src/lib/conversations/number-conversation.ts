import type { SupabaseClient } from '@supabase/supabase-js'
import { isUniqueViolation } from '@/lib/contacts/dedupe'

// ------------------------------------------------------------
// Find-or-create the WhatsApp chat for (account, contact, number).
//
// Since migration 057 a contact has one WhatsApp chat per number. Every
// outbound path that opens a chat (public API, payment webhooks,
// automations, the composer's "message a contact") goes through here so
// the rules match the inbound webhook:
//
//   1. the chat already on this number, oldest-first (the canonical
//      survivor if duplicates ever slipped in);
//   2. else a WhatsApp chat with no number recorded (its number was
//      removed, or it predates the backfill) is adopted by this number,
//      so the customer's history isn't split;
//   3. else a new chat on this number.
//
// A unique-index race on create re-resolves the winner instead of
// failing — same as the webhook.
// ------------------------------------------------------------

export interface NumberConversationInput {
  accountId: string
  contactId: string
  /** whatsapp_config.id the chat lives on. */
  numberId: string
  /** user_id stamped on a newly created row (NOT NULL FK). */
  userId: string
  /** Extra columns for a new row, e.g. status / unread_count. */
  insertExtras?: Record<string, unknown>
}

export interface NumberConversationResult<T> {
  conversation: T
  created: boolean
}

export async function findOrCreateNumberConversation<T extends { id: string } = { id: string }>(
  db: SupabaseClient,
  input: NumberConversationInput,
  select = 'id',
): Promise<NumberConversationResult<T>> {
  const { accountId, contactId, numberId, userId } = input

  const findOnNumber = async (): Promise<T | null> => {
    const { data, error } = await db
      .from('conversations')
      .select(select)
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('whatsapp_config_id', numberId)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) throw new Error(`conversation lookup failed: ${error.message}`)
    return ((data ?? [])[0] as unknown as T) ?? null
  }

  const existing = await findOnNumber()
  if (existing) return { conversation: existing, created: false }

  const { data: legacyRows } = await db
    .from('conversations')
    .select(select)
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .is('whatsapp_config_id', null)
    .eq('channel', 'whatsapp')
    .order('created_at', { ascending: true })
    .limit(1)
  const legacy = ((legacyRows ?? [])[0] as unknown as T) ?? null
  if (legacy) {
    const { error: adoptError } = await db
      .from('conversations')
      .update({ whatsapp_config_id: numberId })
      .eq('id', legacy.id)
    if (!adoptError) return { conversation: legacy, created: false }
    // Lost to a concurrent create on this number — resolved below.
  }

  const { data: created, error: createError } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
      whatsapp_config_id: numberId,
      ...input.insertExtras,
    })
    .select(select)
    .single()

  if (createError || !created) {
    if (isUniqueViolation(createError)) {
      const raced = await findOnNumber()
      if (raced) return { conversation: raced, created: false }
    }
    throw new Error(
      `conversation create failed: ${createError?.message ?? 'no row returned'}`,
    )
  }

  return { conversation: created as unknown as T, created: true }
}
