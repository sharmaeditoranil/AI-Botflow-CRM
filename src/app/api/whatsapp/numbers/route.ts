import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { verifyPhoneNumber } from '@/lib/whatsapp/meta-api'
import { getWhatsAppNumberLimit, listWhatsAppNumbers } from '@/lib/whatsapp/numbers'

/**
 * GET /api/whatsapp/numbers
 *
 * The account's WhatsApp numbers (migration 057) plus the plan limit, for
 * Settings → WhatsApp, inbox badges/filters and the broadcast sender
 * picker. Any member may read it; secrets (tokens) are never returned.
 *
 * Numbers saved before their human-readable phone was recorded get it
 * filled in from Meta here, once, so every list shows "+91 98765 43210"
 * rather than an internal phone number id.
 */
const PUBLIC_COLUMNS =
  'id, label, display_phone_number, phone_number_id, waba_id, status, is_default, registered_at, last_registration_error, coexistence, created_at'

type PublicNumber = {
  id: string
  display_phone_number: string | null
  phone_number_id: string
} & Record<string, unknown>

async function fillMissingDisplayNumbers(accountId: string, numbers: PublicNumber[]) {
  const missing = numbers.filter((n) => !n.display_phone_number)
  if (missing.length === 0) return

  const admin = supabaseAdmin()
  const { data: tokens } = await admin
    .from('whatsapp_config')
    .select('id, access_token')
    .eq('account_id', accountId)
    .in(
      'id',
      missing.map((n) => n.id),
    )
  const tokenById = new Map(
    ((tokens ?? []) as { id: string; access_token: string }[]).map((t) => [t.id, t.access_token]),
  )

  await Promise.all(
    missing.map(async (n) => {
      const encrypted = tokenById.get(n.id)
      if (!encrypted) return
      try {
        const info = await verifyPhoneNumber({
          phoneNumberId: n.phone_number_id,
          accessToken: decrypt(encrypted),
        })
        if (!info?.display_phone_number) return
        n.display_phone_number = info.display_phone_number
        await admin
          .from('whatsapp_config')
          .update({ display_phone_number: info.display_phone_number })
          .eq('id', n.id)
      } catch {
        // Meta unreachable or token invalid — the list still renders with
        // the phone number id; the next load tries again.
      }
    }),
  )
}

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const numbers = await listWhatsAppNumbers<PublicNumber>(supabase, accountId, PUBLIC_COLUMNS)
    await fillMissingDisplayNumbers(accountId, numbers)
    const limit = await getWhatsAppNumberLimit(supabaseAdmin(), accountId)
    return NextResponse.json({
      numbers,
      limit,
      count: numbers.length,
      can_add: numbers.length < limit,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
