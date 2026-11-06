import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder'
import { resolveTemplateRow } from '@/lib/whatsapp/template-body'
import { resolveWhatsAppNumber } from '@/lib/whatsapp/numbers'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  WAHA_DISCONNECTED_CODE,
  WAHA_DISCONNECTED_MESSAGE,
  isWahaSessionLostError,
  isWahaSessionWorking,
  markWahaDisconnected,
  wahaSendGapMs,
} from '@/lib/waha/session-guard'
import {
  recordBroadcastMessageInInbox,
  sendBroadcastMessageToRecipient,
} from '@/lib/whatsapp/broadcast-core'
import {
  isCustomBroadcastTemplate,
  templateFromCustomBroadcastConfig,
  type CustomBroadcastConfig,
} from '@/lib/whatsapp/custom-broadcast'
import type { MessageTemplate } from '@/types'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import {
  checkWalletBalance,
  deductWalletCredits,
  calculateMessageCost,
  getWalletRates,
} from '@/lib/billing/wallet'

interface BroadcastResult {
  phone: string
  /** 'pending': not attempted — WhatsApp Web dropped mid-batch; resume later. */
  status: 'sent' | 'failed' | 'pending'
  whatsapp_message_id?: string
  error?: string
}

/**
 * Two input shapes are accepted:
 *
 *   NEW (preferred — supports per-recipient variable substitution):
 *     {
 *       recipients: Array<{ phone: string; params: string[] }>,
 *       template_name, template_language
 *     }
 *
 *   LEGACY (all phones receive the same params — kept so existing
 *   callers don't break):
 *     {
 *       phone_numbers: string[],
 *       template_params: string[],
 *       template_name, template_language
 *     }
 *
 * Previous implementation only supported the legacy shape, and the
 * sending hook was forced to ship every batch with `templateParams[0]`
 * — meaning every recipient got contact-0's personalization. The new
 * shape is what actually fixes that.
 */
interface NewRecipient {
  phone: string
  /** Body variable values, one per {{N}}. Legacy field. */
  params?: string[]
  /**
   * Structured per-send values (header text variable, media URL
   * override, URL/COPY_CODE button values). When set, takes
   * precedence over `params` for the body too — see
   * sendTemplateMessage for the merge rules.
   */
  messageParams?: SendTimeParams
}

export async function POST(request: Request) {
  try {
    // Requires the 'agent' role — `canSendMessages` in lib/auth/roles is
    // explicit that running broadcasts is a write operation and that
    // viewers are read-only.
    //
    // This endpoint writes NOTHING to the database: it reads the config
    // and template, then calls Meta directly. So unlike the rest of the
    // app there was no RLS policy backstopping a missing role check —
    // resolving `account_id` straight off the profile (which only needs
    // 'viewer') was the ONLY gate, and it let a viewer blast a template
    // to arbitrary phone numbers from the account's WhatsApp number.
    // Nothing about that is recoverable after the fact, so the check has
    // to happen here.
    const { supabase, accountId, userId } = await requireRole('agent')

    // Per-user broadcast budget. Note: this limits how often a user
    // can *start* a campaign, not how many messages go out inside
    // one — the fan-out loop below runs without additional gating.
    const limit = checkRateLimit(`broadcast:${userId}`, RATE_LIMITS.broadcast)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body = await request.json()
    const {
      recipients: newRecipients,
      phone_numbers,
      template_name,
      template_language,
      template_params,
      whatsapp_config_id,
    } = body

    // Normalize to a list of {phone, params} regardless of shape.
    let recipients: NewRecipient[]
    if (Array.isArray(newRecipients) && newRecipients.length > 0) {
      recipients = newRecipients
    } else if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      const shared: string[] = Array.isArray(template_params)
        ? template_params
        : []
      recipients = phone_numbers.map((phone: string) => ({
        phone,
        params: shared,
      }))
    } else {
      return NextResponse.json(
        {
          error:
            'Provide either `recipients` (preferred) or `phone_numbers` — must be a non-empty array',
        },
        { status: 400 }
      )
    }

    // Deduplicate recipients by sanitized phone number so identical numbers in one batch
    // are only sent to once.
    const seenPhones = new Set<string>();
    const uniqueRecipients: NewRecipient[] = [];
    for (const r of recipients) {
      const sanitized = sanitizePhoneForMeta(r.phone || '');
      if (sanitized) {
        if (seenPhones.has(sanitized)) continue;
        seenPhones.add(sanitized);
      }
      uniqueRecipients.push(r);
    }
    recipients = uniqueRecipients;

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      )
    }

    // The number chosen for this broadcast, else the default (057).
    const config = await resolveWhatsAppNumber(
      supabase,
      accountId,
      typeof whatsapp_config_id === 'string' ? whatsapp_config_id : null,
      '*'
    )

    if (!config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Please set up your WhatsApp integration first.',
        },
        { status: 400 }
      )
    }

    const isWaha = config.waba_id === 'waha'
    const accessToken = isWaha ? '' : decrypt(config.access_token)

    // A dead WhatsApp Web session would fail every recipient — stop before
    // sending so they stay pending and can be resumed after reconnecting.
    if (isWaha && !(await isWahaSessionWorking(config.phone_number_id))) {
      await markWahaDisconnected(supabaseAdmin(), config.phone_number_id)
      return NextResponse.json(
        { error: WAHA_DISCONNECTED_MESSAGE, code: WAHA_DISCONNECTED_CODE },
        { status: 409 }
      )
    }

    let templateRow: MessageTemplate | null = null
    let sendLanguage = template_language || 'en_US'

    if (isCustomBroadcastTemplate(template_name)) {
      let customCfg: CustomBroadcastConfig | null =
        body.custom_message && typeof body.custom_message === 'object'
          ? (body.custom_message as CustomBroadcastConfig)
          : null

      if (!customCfg && typeof body.broadcast_id === 'string' && body.broadcast_id) {
        const { data: bcRow } = await supabase
          .from('broadcasts')
          .select('audience_filter')
          .eq('id', body.broadcast_id)
          .maybeSingle()
        const af = bcRow?.audience_filter as {
          customMessage?: CustomBroadcastConfig
        } | null
        if (af?.customMessage) {
          customCfg = af.customMessage
        }
      }

      templateRow = templateFromCustomBroadcastConfig(
        customCfg ?? { bodyText: '', mediaType: 'none' }
      )
    } else {
      // Load the template row once so sendTemplateMessage can build
      // header + button components on each iteration. Loading inside
      // the loop would N+1 against Supabase for every recipient.
      // Guard against a malformed local row crashing every send in
      // the loop with the same opaque TypeError — fail loudly once.
      const resolvedTemplate = await resolveTemplateRow(
        supabase,
        accountId,
        template_name,
        template_language,
        config.waba_id,
      )
      if (resolvedTemplate.malformed) {
        return NextResponse.json(
          {
            error:
              'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
          },
          { status: 500 },
        )
      }
      templateRow = resolvedTemplate.row
      sendLanguage = resolvedTemplate.language
    }

    // Verify wallet balance for the planned broadcast
    const rates = await getWalletRates()
    const costPerMsg = calculateMessageCost(templateRow?.category, rates)
    let isWalletControlled = false
    try {
      const estimatedCost = recipients.length * costPerMsg
      const balanceCheck = await checkWalletBalance(accountId, estimatedCost)
      if (!balanceCheck.allowed) {
        return NextResponse.json(
          {
            error: `Insufficient wallet balance (₹${balanceCheck.balance.toFixed(2)}). Required: ₹${estimatedCost.toFixed(2)} for ${recipients.length} messages. Please recharge your wallet.`,
          },
          { status: 402 }
        )
      }
      isWalletControlled = balanceCheck.rates.enabled
    } catch (wErr) {
      console.warn('[broadcast] wallet check non-blocking error:', wErr)
    }

    const results: BroadcastResult[] = new Array(recipients.length)
    let sentCount = 0
    let newlySentCount = 0
    let failedCount = 0

    // Duplicate-send guard: if a broadcast for this account + template is
    // already in-flight (or was simultaneously completed by a server-side
    // resume / cron pass while the browser tab was still looping), reuse
    // the already-sent whatsapp_message_id instead of messaging the
    // customer a second time.
    const alreadySentBySanitizedPhone = new Map<string, string>()
    try {
      const targetBroadcastId =
        typeof body.broadcast_id === 'string' && body.broadcast_id
          ? body.broadcast_id
          : null

      let activeBroadcastId = targetBroadcastId
      if (!activeBroadcastId) {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
        const { data: recentBc } = await supabase
          .from('broadcasts')
          .select('id')
          .eq('account_id', accountId)
          .eq('template_name', template_name)
          .gte('created_at', sixHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        activeBroadcastId = recentBc?.id ?? null
      }

      if (activeBroadcastId) {
        const rawPhones = recipients.map((r) => r.phone).filter(Boolean)
        const { data: matchingContacts } = await supabase
          .from('contacts')
          .select('id, phone')
          .eq('account_id', accountId)
          .in('phone', rawPhones)

        if (matchingContacts && matchingContacts.length > 0) {
          const phoneByContactId = new Map<string, string>()
          for (const c of matchingContacts) {
            if (c.id && c.phone) {
              phoneByContactId.set(c.id, sanitizePhoneForMeta(c.phone))
            }
          }
          const { data: existingRecs } = await supabase
            .from('broadcast_recipients')
            .select('contact_id, status, whatsapp_message_id')
            .eq('broadcast_id', activeBroadcastId)
            .in('contact_id', [...phoneByContactId.keys()])
            .in('status', ['sent', 'delivered', 'read', 'replied'])

          for (const rec of existingRecs ?? []) {
            const sanitizedPhone = phoneByContactId.get(rec.contact_id)
            if (sanitizedPhone && rec.whatsapp_message_id) {
              alreadySentBySanitizedPhone.set(
                sanitizedPhone,
                rec.whatsapp_message_id
              )
            }
          }
        }
      }
    } catch {
      // Non-blocking guard: proceed with normal sending if lookup fails
    }

    // WhatsApp Web: one at a time with a pause, like a person sending —
    // parallel bulk sends get the session cut off by WhatsApp.
    const SEND_CONCURRENCY = isWaha ? 1 : 10
    let cursor = 0
    let sessionLost = false
    let wahaSent = 0
    const workerCount = Math.min(
      SEND_CONCURRENCY,
      Math.max(1, recipients.length)
    )

    const runWorker = async () => {
      while (true) {
        const idx = cursor++
        if (idx >= recipients.length) break
        const recipient = recipients[idx]

        if (sessionLost) {
          results[idx] = {
            phone: recipient.phone,
            status: 'pending',
            error: WAHA_DISCONNECTED_MESSAGE,
          }
          continue
        }
        const sanitized = sanitizePhoneForMeta(recipient.phone)

        if (!isValidE164(sanitized)) {
          results[idx] = {
            phone: recipient.phone,
            status: 'failed',
            error: 'Invalid phone number format',
          }
          failedCount++
          continue
        }

        const alreadySentMsgId = alreadySentBySanitizedPhone.get(sanitized)
        if (alreadySentMsgId) {
          results[idx] = {
            phone: recipient.phone,
            status: 'sent',
            whatsapp_message_id: alreadySentMsgId,
          }
          sentCount++
          continue
        }

        // Retry with phone variants on "not in allowed list" so numbers
        // that differ only in a trunk-prefix 0 still reach recipients.
        const variants =
          config.waba_id === 'waha' ? [sanitized] : phoneVariants(sanitized)
        let sentMessageId: string | null = null
        let lastError: string | null = null

        if (isWaha && wahaSent > 0) {
          await new Promise((r) => setTimeout(r, wahaSendGapMs()))
        }
        for (const variant of variants) {
          try {
            const result = await sendBroadcastMessageToRecipient({
              wabaId: config.waba_id,
              phoneNumberId: config.phone_number_id,
              accessToken,
              toPhone: variant,
              templateName: template_name,
              templateLanguage: sendLanguage,
              templateRow,
              messageParams: recipient.messageParams,
              params: recipient.params ?? [],
            })
            sentMessageId = result.messageId
            lastError = null
            break
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error'
            if (!isRecipientNotAllowedError(errorMessage)) {
              lastError = errorMessage
              break
            }
            lastError = errorMessage
            // retry with next variant
          }
        }

        if (isWaha) wahaSent++
        if (!sentMessageId && isWaha && isWahaSessionLostError(lastError)) {
          sessionLost = true
          await markWahaDisconnected(supabaseAdmin(), config.phone_number_id)
          results[idx] = {
            phone: recipient.phone,
            status: 'pending',
            error: WAHA_DISCONNECTED_MESSAGE,
          }
          continue
        }

        if (sentMessageId) {
          results[idx] = {
            phone: recipient.phone,
            status: 'sent',
            whatsapp_message_id: sentMessageId,
          }
          sentCount++
          newlySentCount++

          await recordBroadcastMessageInInbox(supabase, {
            accountId,
            userId,
            whatsappConfigId: config.id,
            phone: recipient.phone,
            templateName: template_name,
            templateRow,
            params: recipient.params ?? [],
            messageParams: recipient.messageParams,
            whatsappMessageId: sentMessageId,
          }).catch(() => {})
        } else {
          console.error(
            `Failed to send broadcast to ${recipient.phone}:`,
            lastError
          )
          results[idx] = {
            phone: recipient.phone,
            status: 'failed',
            error: lastError || 'Unknown error',
          }
          failedCount++
        }
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

    // Deduct actual newly sent message credits from wallet
    if (isWalletControlled && newlySentCount > 0) {
      const actualDeduct = newlySentCount * costPerMsg
      void deductWalletCredits({
        accountId,
        amount: actualDeduct,
        referenceType: 'broadcast',
        referenceId: template_name,
        description: `WhatsApp Broadcast (${template_name}): ${newlySentCount} sent`,
        metadata: {
          templateName: template_name,
          sentCount: newlySentCount,
          failedCount,
          costPerMsg,
        },
      }).catch((deductErr) => {
        console.warn('[broadcast] wallet deduction failed:', deductErr)
      })
    }

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results,
      ...(sessionLost ? { code: WAHA_DISCONNECTED_CODE, error: WAHA_DISCONNECTED_MESSAGE } : {}),
    })
  } catch (error) {
    // requireRole throws Unauthorized/Forbidden; toErrorResponse maps
    // those to 401/403 and collapses anything else to a generic 500.
    console.error('Error in WhatsApp broadcast POST:', error)
    return toErrorResponse(error)
  }
}
