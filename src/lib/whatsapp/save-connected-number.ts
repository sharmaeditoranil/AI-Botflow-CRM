import type { SupabaseClient } from '@supabase/supabase-js'
import { getWhatsAppNumberLimit } from '@/lib/whatsapp/numbers'

// ------------------------------------------------------------
// Persist a number connected through Meta Embedded Signup (migration 057).
//
// Both the popup flow (POST /api/whatsapp/embedded-signup) and the
// redirect flow (/embedded-signup/callback) land here, so the rules are
// identical:
//
//   - reconnecting a number the account already has updates that row and
//     keeps its label / default flag;
//   - a number owned by another account is refused (one number, one
//     account — the webhook routes by phone_number_id);
//   - a new number must fit the plan limit; the first one becomes the
//     account's default.
// ------------------------------------------------------------

export interface ConnectedNumberInput {
  accountId: string
  userId: string
  phoneNumberId: string
  wabaId: string | null
  encryptedAccessToken: string
  coexistence: boolean
  displayPhoneNumber?: string | null
}

export type SaveConnectedNumberResult =
  | { ok: true; numberId: string; created: boolean }
  | { ok: false; code: 'claimed' | 'number_limit_reached' | 'db_error'; message: string }

/**
 * Pick which of a WABA's phone numbers an Embedded Signup run meant to
 * connect when Meta didn't say: the first one this account hasn't
 * connected yet, else the first one (a reconnect).
 */
export function pickNumberToConnect<T extends { id: string }>(
  wabaNumbers: T[],
  alreadyConnectedIds: string[],
): T | null {
  if (wabaNumbers.length === 0) return null
  return wabaNumbers.find((n) => !alreadyConnectedIds.includes(n.id)) ?? wabaNumbers[0]
}

export async function saveConnectedNumber(
  admin: SupabaseClient,
  input: ConnectedNumberInput,
): Promise<SaveConnectedNumberResult> {
  const now = new Date().toISOString()

  const { data: owners, error: ownerError } = await admin
    .from('whatsapp_config')
    .select('id, account_id')
    .eq('phone_number_id', input.phoneNumberId)
  if (ownerError) return { ok: false, code: 'db_error', message: ownerError.message }

  const rows = (owners ?? []) as { id: string; account_id: string }[]
  if (rows.some((r) => r.account_id !== input.accountId)) {
    return {
      ok: false,
      code: 'claimed',
      message:
        'This WhatsApp number is already connected to another account. Each number can be connected to one account only.',
    }
  }

  const row: Record<string, unknown> = {
    account_id: input.accountId,
    user_id: input.userId,
    phone_number_id: input.phoneNumberId,
    waba_id: input.wabaId,
    access_token: input.encryptedAccessToken,
    status: 'connected',
    coexistence: input.coexistence,
    connected_at: now,
    registered_at: now,
    subscribed_apps_at: now,
    last_registration_error: null,
    updated_at: now,
    ...(input.displayPhoneNumber ? { display_phone_number: input.displayPhoneNumber } : {}),
  }

  const existing = rows.find((r) => r.account_id === input.accountId)
  if (existing) {
    const { error } = await admin.from('whatsapp_config').update(row).eq('id', existing.id)
    if (error) return { ok: false, code: 'db_error', message: error.message }
    return { ok: true, numberId: existing.id, created: false }
  }

  const { count, error: countError } = await admin
    .from('whatsapp_config')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', input.accountId)
  if (countError) return { ok: false, code: 'db_error', message: countError.message }

  const current = count ?? 0
  const limit = await getWhatsAppNumberLimit(admin, input.accountId)
  if (current >= limit) {
    return {
      ok: false,
      code: 'number_limit_reached',
      message: `Your plan allows ${limit} WhatsApp number${limit === 1 ? '' : 's'}. Upgrade your plan to connect another number.`,
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from('whatsapp_config')
    .insert({ ...row, is_default: current === 0 })
    .select('id')
    .single()
  if (insertError || !inserted) {
    return { ok: false, code: 'db_error', message: insertError?.message ?? 'insert failed' }
  }
  return { ok: true, numberId: inserted.id as string, created: true }
}
