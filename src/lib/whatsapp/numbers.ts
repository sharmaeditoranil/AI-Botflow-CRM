import type { SupabaseClient } from '@supabase/supabase-js'

// ------------------------------------------------------------
// WhatsApp numbers (migration 057).
//
// An account can connect several WhatsApp numbers. Every code path that
// needs "the" number goes through this module so the rule is the same
// everywhere:
//
//   - A chat sends from the number it lives on
//     (conversations.whatsapp_config_id).
//   - Anything without a more specific number (a brand-new chat, an
//     automation, an API send) uses the account's default number.
//   - A chat whose number was removed falls back to the default, which
//     is exactly how single-number accounts have always behaved.
//
// Nothing here throws on "not configured"; callers keep their own error
// shapes and messages and just check for null.
// ------------------------------------------------------------

/** Columns most callers need. `*` is still allowed via `select`. */
export const NUMBER_COLUMNS =
  'id, account_id, user_id, phone_number_id, waba_id, access_token, status, label, display_phone_number, is_default, created_at'

export interface WhatsAppNumber {
  id: string
  account_id: string
  user_id: string
  phone_number_id: string
  waba_id: string | null
  access_token: string
  status: 'connected' | 'disconnected'
  label: string | null
  display_phone_number: string | null
  is_default: boolean
  created_at: string
  [key: string]: unknown
}

type Db = SupabaseClient

/**
 * All numbers on an account, default first, then oldest first. Order is
 * stable so pickers and badges don't reshuffle between renders.
 */
export async function listWhatsAppNumbers<T = WhatsAppNumber>(
  db: Db,
  accountId: string,
  select: string = NUMBER_COLUMNS,
): Promise<T[]> {
  const { data, error } = await db
    .from('whatsapp_config')
    .select(select)
    .eq('account_id', accountId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`could not load WhatsApp numbers: ${error.message}`)
  return (data ?? []) as T[]
}

/**
 * The account's default number. If no row is flagged (data written
 * before migration 057, or the default was just removed) the oldest
 * number wins, so a single-number account always resolves.
 */
export async function getDefaultWhatsAppNumber<T = WhatsAppNumber>(
  db: Db,
  accountId: string,
  select: string = NUMBER_COLUMNS,
): Promise<T | null> {
  const rows = await listWhatsAppNumbers<T>(db, accountId, select)
  return rows[0] ?? null
}

/** A specific number, scoped to the account so ids can't cross tenants. */
export async function getWhatsAppNumberById<T = WhatsAppNumber>(
  db: Db,
  accountId: string,
  numberId: string,
  select: string = NUMBER_COLUMNS,
): Promise<T | null> {
  const { data, error } = await db
    .from('whatsapp_config')
    .select(select)
    .eq('account_id', accountId)
    .eq('id', numberId)
    .maybeSingle()
  if (error) throw new Error(`could not load WhatsApp number: ${error.message}`)
  return (data as T | null) ?? null
}

/**
 * The number to use for an explicit choice, falling back to the default
 * when the choice is empty or no longer exists.
 */
export async function resolveWhatsAppNumber<T = WhatsAppNumber>(
  db: Db,
  accountId: string,
  numberId: string | null | undefined,
  select: string = NUMBER_COLUMNS,
): Promise<T | null> {
  if (numberId) {
    const chosen = await getWhatsAppNumberById<T>(db, accountId, numberId, select)
    if (chosen) return chosen
  }
  return getDefaultWhatsAppNumber<T>(db, accountId, select)
}

/** The number a chat lives on (or the default, see module comment). */
export async function getWhatsAppNumberForConversation<T = WhatsAppNumber>(
  db: Db,
  accountId: string,
  conversationId: string | null | undefined,
  select: string = NUMBER_COLUMNS,
): Promise<T | null> {
  let numberId: string | null = null
  if (conversationId) {
    const { data } = await db
      .from('conversations')
      .select('whatsapp_config_id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle()
    numberId = (data?.whatsapp_config_id as string | null | undefined) ?? null
  }
  return resolveWhatsAppNumber<T>(db, accountId, numberId, select)
}

/**
 * A number on the given WABA (default-first), for WABA-scoped work such
 * as editing or deleting a template. A template with no WABA recorded
 * (legacy) uses the default number.
 */
export async function getWhatsAppNumberForWaba<T = WhatsAppNumber>(
  db: Db,
  accountId: string,
  wabaId: string | null | undefined,
  select: string = NUMBER_COLUMNS,
): Promise<T | null> {
  const withWaba = select === '*' || select.includes('waba_id') ? select : `${select}, waba_id`
  const rows = await listWhatsAppNumbers<T & { waba_id?: string | null }>(db, accountId, withWaba)
  if (wabaId) {
    const match = rows.find((r) => r.waba_id === wabaId)
    if (match) return match
  }
  return rows[0] ?? null
}

/** How many numbers the account's plan allows. Defaults to 1. */
export async function getWhatsAppNumberLimit(db: Db, accountId: string): Promise<number> {
  const { data } = await db
    .from('accounts')
    .select('plan:plans(max_whatsapp_numbers)')
    .eq('id', accountId)
    .maybeSingle()
  const plan = (data as { plan?: { max_whatsapp_numbers?: number | null } | null } | null)?.plan
  const limit = Number(plan?.max_whatsapp_numbers)
  return Number.isFinite(limit) && limit > 0 ? limit : 1
}

/**
 * Short name for a number: its label, else the display number, else the
 * tail of the Meta phone number id. Used for inbox badges and pickers.
 */
export function numberDisplayName(n: {
  label?: string | null
  display_phone_number?: string | null
  phone_number_id?: string | null
}): string {
  const label = n.label?.trim()
  if (label) return label
  const display = n.display_phone_number?.trim()
  if (display) return display
  const id = n.phone_number_id ?? ''
  return id ? `Number •••${id.slice(-4)}` : 'WhatsApp number'
}
