// ------------------------------------------------------------
// Should an AI follow-up go out to this customer right now?
//
//   - Never to a customer who unsubscribed (opted out, or carries the
//     "Unsubscribed" tag) — the deal's follow-ups are switched off.
//   - Not as free text through a Meta Cloud API number once 24 hours
//     have passed since the customer's last message: Meta rejects it
//     ("Re-engagement message"), which only left a failed bubble in the
//     chat every few days. WhatsApp Web (WAHA) numbers have no window.
// ------------------------------------------------------------

export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

export type FollowupBlock =
  | { kind: 'opted_out' }
  | { kind: 'window_closed' }
  | null

export interface FollowupGuardInput {
  isOptedOut: boolean | null | undefined
  tagNames: string[]
  /** 'waha' for WhatsApp Web; anything else is the Meta Cloud API. */
  wabaId: string | null | undefined
  lastCustomerMessageAt: string | null | undefined
  now?: Date
}

export function followupBlock(input: FollowupGuardInput): FollowupBlock {
  if (input.isOptedOut || input.tagNames.some((n) => n.trim().toLowerCase() === 'unsubscribed')) {
    return { kind: 'opted_out' }
  }
  if (input.wabaId === 'waha') return null
  const last = input.lastCustomerMessageAt ? new Date(input.lastCustomerMessageAt).getTime() : NaN
  const now = (input.now ?? new Date()).getTime()
  if (Number.isNaN(last) || now - last >= SESSION_WINDOW_MS) return { kind: 'window_closed' }
  return null
}

/** Toast text for a follow-up the runner skipped (manual "send now"). */
export function followupSkipMessage(skipped: { reason?: string }[] | undefined): string {
  const reason = skipped?.[0]?.reason
  if (reason === 'unsubscribed') return 'Customer has unsubscribed — AI follow-up turned off for this deal.'
  if (reason === 'window_closed') {
    return 'Not sent: the customer has not messaged in 24 hours, so WhatsApp only allows an approved template now.'
  }
  return 'Follow-up checked.'
}
