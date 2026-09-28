import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  getWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  getWhatsAppCommerceSettings,
  updateWhatsAppCommerceSettings,
} from '@/lib/whatsapp/meta-api'

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'No account linked to user' }, { status: 400 })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token, status')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError || !config || !config.phone_number_id || !config.access_token) {
      return NextResponse.json({
        configured: false,
        message: 'WhatsApp is not connected for this account',
      })
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch {
      return NextResponse.json(
        { error: 'Failed to decrypt WhatsApp access token' },
        { status: 500 }
      )
    }

    // Fetch both business profile & commerce settings concurrently
    const [profileResult, commerceResult] = await Promise.allSettled([
      getWhatsAppBusinessProfile({
        phoneNumberId: config.phone_number_id,
        accessToken,
      }),
      getWhatsAppCommerceSettings({
        phoneNumberId: config.phone_number_id,
        accessToken,
      }),
    ])

    const profile =
      profileResult.status === 'fulfilled' ? profileResult.value : null
    const commerce =
      commerceResult.status === 'fulfilled' ? commerceResult.value : { is_catalog_visible: false, is_cart_enabled: false }

    const profileError =
      profileResult.status === 'rejected' ? (profileResult.reason as Error)?.message : null

    return NextResponse.json({
      configured: true,
      phoneNumberId: config.phone_number_id,
      profile,
      commerce,
      profileError,
    })
  } catch (err: any) {
    console.error('[whatsapp/business-profile GET] Error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'No account linked to user' }, { status: 400 })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token, status')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError || !config || !config.phone_number_id || !config.access_token) {
      return NextResponse.json(
        { error: 'WhatsApp is not configured for this account' },
        { status: 400 }
      )
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch {
      return NextResponse.json(
        { error: 'Failed to decrypt WhatsApp access token' },
        { status: 500 }
      )
    }

    const body = await req.json()
    const {
      about,
      description,
      address,
      email,
      websites,
      vertical,
      is_catalog_visible,
      is_cart_enabled,
    } = body

    if (about !== undefined && typeof about === 'string') {
      if (about.length > 139) {
        return NextResponse.json(
          { error: 'About text cannot exceed 139 characters (Meta limit).' },
          { status: 400 }
        )
      }
    }

    // 1. Update Profile if any profile field is provided
    const hasProfileFields =
      about !== undefined ||
      description !== undefined ||
      address !== undefined ||
      email !== undefined ||
      websites !== undefined ||
      vertical !== undefined

    if (hasProfileFields) {
      await updateWhatsAppBusinessProfile({
        phoneNumberId: config.phone_number_id,
        accessToken,
        about: about !== undefined ? String(about).trim() : undefined,
        description: description !== undefined ? String(description).trim() : undefined,
        address: address !== undefined ? String(address).trim() : undefined,
        email: email !== undefined ? String(email).trim() : undefined,
        websites: Array.isArray(websites)
          ? websites.filter((w) => typeof w === 'string' && w.trim().length > 0)
          : undefined,
        vertical: vertical !== undefined ? String(vertical) : undefined,
      })
    }

    // 2. Update Commerce / Catalog settings if provided
    if (is_catalog_visible !== undefined || is_cart_enabled !== undefined) {
      try {
        await updateWhatsAppCommerceSettings({
          phoneNumberId: config.phone_number_id,
          accessToken,
          isCatalogVisible: Boolean(is_catalog_visible),
          isCartEnabled: is_cart_enabled !== undefined ? Boolean(is_cart_enabled) : true,
        })
      } catch (commerceErr: any) {
        console.warn('[whatsapp/business-profile] Commerce settings update warning:', commerceErr?.message)
        // If Commerce settings fail (e.g. no catalog created in Meta Commerce Manager yet),
        // we still want to inform the user gracefully.
        return NextResponse.json({
          success: true,
          warning:
            'Profile updated, but Catalog storefront setting could not be applied on Meta. Please ensure a catalog is created and connected in Meta Commerce Manager.',
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp Business Profile & settings updated successfully!',
    })
  } catch (err: any) {
    console.error('[whatsapp/business-profile POST] Error:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to update WhatsApp profile' },
      { status: 500 }
    )
  }
}
