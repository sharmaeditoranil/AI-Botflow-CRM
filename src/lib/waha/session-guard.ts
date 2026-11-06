import type { SupabaseClient } from '@supabase/supabase-js'
import { getWahaSessionStatus } from './client'

// ------------------------------------------------------------
// Sending in bulk over WhatsApp Web (WAHA) safely.
//
// A broadcast fired 10 sends at once through one WhatsApp Web session;
// WhatsApp ended the session mid-run ("conflict" → FAILED), and every
// remaining recipient then failed with "Session status is not as
// expected" while the number still showed as connected. Bulk WAHA sends
// now go one at a time with a human-like gap, and the run stops as soon
// as the session is gone so the rest can be resumed after reconnecting.
// ------------------------------------------------------------

export { WAHA_DISCONNECTED_CODE, WAHA_DISCONNECTED_MESSAGE } from './session-codes'

/** The send failed because the WhatsApp Web session is no longer usable. */
export function isWahaSessionLostError(message: string | null | undefined): boolean {
  return /session status is not as expected|connection closed|session .*(not found|does not exist)|status.*(STOPPED|FAILED|SCAN_QR_CODE)/i.test(
    message ?? '',
  )
}

/** Pause between two bulk WhatsApp Web sends: 1.5–3 s. */
export function wahaSendGapMs(random: () => number = Math.random): number {
  return 1500 + Math.floor(random() * 1500)
}

export async function isWahaSessionWorking(sessionName: string): Promise<boolean> {
  const session = await getWahaSessionStatus(sessionName)
  return session?.status === 'WORKING'
}

/** Show the number as disconnected in Settings and the inbox. */
export async function markWahaDisconnected(db: SupabaseClient, sessionName: string): Promise<void> {
  await db
    .from('whatsapp_config')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('phone_number_id', sessionName)
    .eq('waba_id', 'waha')
}
