import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { getWhatsAppNumberLimit, listWhatsAppNumbers } from '@/lib/whatsapp/numbers'

/**
 * GET /api/whatsapp/numbers
 *
 * The account's WhatsApp numbers (migration 057) plus the plan limit, for
 * Settings → WhatsApp, inbox badges/filters and the broadcast sender
 * picker. Any member may read it; secrets (tokens) are never returned.
 */
const PUBLIC_COLUMNS =
  'id, label, display_phone_number, phone_number_id, waba_id, status, is_default, registered_at, last_registration_error, coexistence, created_at'

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const numbers = await listWhatsAppNumbers(supabase, accountId, PUBLIC_COLUMNS)
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
