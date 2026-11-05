// ============================================================
// Public-API broadcast core.
//
// Splits a broadcast into two phases so the HTTP route can persist +
// acknowledge fast and fan out afterwards (in `after()`):
//
//   createBroadcast()  — validate, resolve contacts, insert the
//                        `broadcasts` row + `broadcast_recipients`
//                        rows (status 'pending'), return a plan.
//   deliverBroadcast() — send each recipient's template via Meta
//                        (phone-variant retry), stamp each recipient
//                        row + the aggregate counts, finalize status.
//
// Recipient rows carry `whatsapp_message_id`, so the inbound webhook's
// status handler (which matches on that column) updates delivered/read
// for API broadcasts exactly as it does for dashboard ones.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendTemplateMessage,
  sendTextMessage,
  sendMediaMessage,
  sendInteractiveButtons,
  sendInteractiveCtaUrl,
} from '@/lib/whatsapp/meta-api';
import { sendWahaText, sendWahaMedia } from '@/lib/waha/client';
import {
  isCustomBroadcastTemplate,
  formatBroadcastTemplateDisplayName,
} from '@/lib/whatsapp/custom-broadcast';
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import {
  resolveTemplateRow,
  templateBodyParams,
  templateContentText,
} from '@/lib/whatsapp/template-body';
import { resolveWhatsAppNumber } from '@/lib/whatsapp/numbers';
import { findOrCreateNumberConversation } from '@/lib/conversations/number-conversation';
import type { MessageTemplate } from '@/types';
import { findOrCreateContact } from '@/lib/api/v1/contacts';
import {
  checkWalletBalance,
  deductWalletCredits,
  calculateMessageCost,
  getWalletRates,
} from '@/lib/billing/wallet';

/** Thrown by createBroadcast on a caller-visible failure; route maps it. */
export class BroadcastError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BroadcastError';
    this.code = code;
    this.status = status;
  }
}

export interface BroadcastRecipientInput {
  /** E.164 phone. */
  to: string;
  /** Positional body params for the template ({{1}}, {{2}}…). */
  params?: string[];
}

export interface CreateBroadcastParams {
  name?: string | null;
  templateName: string;
  templateLanguage?: string | null;
  recipients: BroadcastRecipientInput[];
  /** Number to send from (migration 057). Empty = account default. */
  whatsappConfigId?: string | null;
}

interface PlannedRecipient {
  recipientRowId: string;
  phone: string;
  params: string[];
}

export interface BroadcastPlan {
  broadcastId: string;
  accountId?: string;
  templateName: string;
  templateLanguage: string;
  phoneNumberId: string;
  wabaId?: string | null;
  accessToken: string;
  templateRow: MessageTemplate | null;
  messageParams?: SendTimeParams;
  checkPendingBeforeSend?: boolean;
  planned: PlannedRecipient[];
  /** Phones rejected up front (invalid E.164) — counted as failed. */
  rejected: number;
}

const MAX_RECIPIENTS = 1000;
const DELIVER_CONCURRENCY = 10;

/**
 * Validate + persist a broadcast, resolving each recipient to a
 * contact. Returns a plan for {@link deliverBroadcast}. Throws
 * {@link BroadcastError} on bad input / missing config / a malformed
 * template / a DB failure — nothing is sent in this phase.
 */
export async function createBroadcast(
  db: SupabaseClient,
  accountId: string,
  auditUserId: string,
  params: CreateBroadcastParams
): Promise<BroadcastPlan> {
  const { name, templateName, recipients } = params;

  if (!templateName) {
    throw new BroadcastError('bad_request', "'template_name' is required", 400);
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new BroadcastError(
      'bad_request',
      "'recipients' must be a non-empty array of { to, params? }",
      400
    );
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new BroadcastError(
      'bad_request',
      `A broadcast is capped at ${MAX_RECIPIENTS} recipients per request; split larger sends`,
      400
    );
  }

  // Config (fail fast + provides the audit trail owner already resolved
  // by the caller). Meta send needs phone_number_id + decrypted token.
  // The chosen number, else the account default (migration 057).
  const config = await resolveWhatsAppNumber(
    db,
    accountId,
    params.whatsappConfigId,
    '*'
  );
  if (!config) {
    throw new BroadcastError(
      'whatsapp_not_configured',
      'WhatsApp not configured. Please set up your WhatsApp integration first.',
      400
    );
  }
  const accessToken = decrypt(config.access_token);

  // Template row (once) for header/button components; guard a
  // malformed local row rather than N identical opaque failures.
  const resolvedTemplate = await resolveTemplateRow(
    db,
    accountId,
    templateName,
    params.templateLanguage,
    config.waba_id
  );
  if (resolvedTemplate.malformed) {
    throw new BroadcastError(
      'template_malformed',
      'Template row is malformed locally — run "Sync from Meta" in Settings to repair it before broadcasting.',
      500
    );
  }
  const templateRow = resolvedTemplate.row;

  // Resolve each recipient to a contact. Invalid phones are dropped
  // (counted as rejected) rather than aborting the whole broadcast.
  const resolved: { contactId: string; phone: string; params: string[] }[] = [];
  let rejected = 0;
  for (const r of recipients) {
    const sanitized = sanitizePhoneForMeta(typeof r.to === 'string' ? r.to : '');
    if (!isValidE164(sanitized)) {
      rejected++;
      continue;
    }
    const { id } = await findOrCreateContact(db, accountId, auditUserId, {
      phone: sanitized,
    });
    resolved.push({
      contactId: id,
      phone: sanitized,
      params: Array.isArray(r.params)
        ? r.params.filter((p): p is string => typeof p === 'string')
        : [],
    });
  }

  // Collapse recipients that resolved to the SAME contact (the caller
  // listed a phone twice, or two numbers fuzzy-matched to one contact).
  // Keep the first occurrence so the contact is messaged once and its
  // params aren't silently overwritten by a later duplicate — and so
  // the row↔params pairing below (keyed by contact_id) is unambiguous.
  const seenContact = new Set<string>();
  const deduped = resolved.filter((r) => {
    if (seenContact.has(r.contactId)) return false;
    seenContact.add(r.contactId);
    return true;
  });

  if (deduped.length === 0) {
    throw new BroadcastError(
      'bad_request',
      'No recipients had a valid E.164 phone number',
      400
    );
  }

  // Pre-check wallet balance for broadcast
  const rates = await getWalletRates();
  const costPerMsg = calculateMessageCost(templateRow?.category, rates);
  const estimatedTotalCost = deduped.length * costPerMsg;
  try {
    const balanceCheck = await checkWalletBalance(accountId, estimatedTotalCost);
    if (!balanceCheck.allowed) {
      throw new BroadcastError(
        'insufficient_balance',
        `Insufficient wallet balance (₹${balanceCheck.balance.toFixed(2)}). Required: ₹${estimatedTotalCost.toFixed(2)} for ${deduped.length} messages. Please recharge your wallet.`,
        402
      );
    }
  } catch (wErr) {
    if (wErr instanceof BroadcastError) throw wErr;
    console.warn('[broadcast-core] wallet check non-blocking:', wErr);
  }

  // Persist the broadcast + its recipients. The count columns
  // (sent/delivered/read/replied/failed) are owned by the DB aggregate
  // trigger (migrations 003/005) and derived purely from
  // broadcast_recipients rows — we deliberately do NOT seed them here
  // (a manual value would be clobbered by the trigger on the first
  // recipient change). `rejected` phones have no recipient row, so they
  // are reported to the caller in the POST response, not in these
  // persisted counts.
  // Insert the parent broadcast and its recipient rows in ONE transaction
  // (migration 037's create_broadcast_with_recipients). Previously these
  // were two separate inserts: if the recipient insert failed, the parent
  // was already persisted with status 'sending' and no recipients, leaving
  // an orphaned campaign that looked like it was sending but had no
  // delivery plan (issue #370). The function body is atomic, so a recipient
  // failure now rolls the parent back and nothing orphaned survives.
  const { data: createdRows, error: createErr } = await db.rpc(
    'create_broadcast_with_recipients',
    {
      p_account_id: accountId,
      p_user_id: auditUserId,
      p_name: name || `API broadcast (${templateName})`,
      p_template_name: templateName,
      p_template_language: resolvedTemplate.language,
      p_total_recipients: deduped.length,
      p_contact_ids: deduped.map((r) => r.contactId),
      // Frozen per-recipient params (migration 038) — without them a
      // resume of this broadcast has no way to reconstruct {{1}}.
      p_template_params: deduped.map((r) => r.params),
      // The sending number, so a later resume uses the same one (057).
      p_whatsapp_config_id: config.id,
    }
  );
  if (createErr || !createdRows || createdRows.length === 0) {
    console.error('[broadcast-core] create broadcast error:', createErr);
    throw new BroadcastError('internal', 'Failed to create broadcast', 500);
  }

  const broadcastId = createdRows[0].broadcast_id as string;

  // Pair each inserted recipient row back to its phone/params by
  // contact_id — unambiguous now that duplicates are collapsed.
  const byContact = new Map(deduped.map((r) => [r.contactId, r]));
  const planned: PlannedRecipient[] = createdRows.map(
    (row: { recipient_id: string; contact_id: string }) => {
      const r = byContact.get(row.contact_id)!;
      return { recipientRowId: row.recipient_id, phone: r.phone, params: r.params };
    }
  );

  return {
    broadcastId,
    accountId,
    templateName,
    templateLanguage: resolvedTemplate.language,
    phoneNumberId: config.phone_number_id,
    accessToken,
    templateRow,
    planned,
    rejected,
  };
}

/**
 * Fan out a {@link BroadcastPlan}: send each recipient's template
 * (phone-variant retry) and stamp its `broadcast_recipients` row.
 * Best-effort per recipient — one failure never aborts the rest.
 * Designed to run inside `after()`.
 *
 * The per-status count columns on `broadcasts` are owned by the DB
 * aggregate trigger (migrations 003/005): each recipient-row update
 * below advances them automatically, and later Meta delivery/read
 * webhooks keep advancing them. We therefore never write those columns
 * here — only the terminal `status` — otherwise a manual value would
 * race and clobber the trigger-maintained counts.
 */
export interface SendBroadcastRecipientArgs {
  wabaId?: string | null;
  phoneNumberId: string;
  accessToken: string;
  toPhone: string;
  templateName: string;
  templateLanguage: string;
  templateRow: MessageTemplate | null;
  params?: string[];
  messageParams?: SendTimeParams;
}

/**
 * Unified sender for a single broadcast recipient:
 * 1. WhatsApp Web (WAHA: `wabaId === 'waha'`) — sends custom or template messages via WAHA with image/video/document + text + formatted buttons.
 * 2. Custom 24-Hour Window Message (`isCustomBroadcastTemplate(templateName)`) on Official Cloud API — sends free-form text, media (image/video), or interactive buttons (with media header + body + reply/CTA buttons).
 * 3. Approved Meta Template on Official Cloud API — sends `sendTemplateMessage`.
 */
export async function sendBroadcastMessageToRecipient(
  args: SendBroadcastRecipientArgs
): Promise<{ messageId: string }> {
  const {
    wabaId,
    phoneNumberId,
    accessToken,
    toPhone,
    templateName,
    templateLanguage,
    templateRow,
    params = [],
    messageParams,
  } = args;

  const isCustom = isCustomBroadcastTemplate(templateName);
  const bodyParams = templateBodyParams(params, messageParams);
  const resolvedBody =
    templateContentText(templateRow, bodyParams, templateRow?.body_text ?? '') ||
    templateRow?.body_text ||
    '';

  const mediaUrl =
    messageParams?.headerMediaUrl ||
    templateRow?.header_media_url ||
    (templateRow?.header_handle &&
    /^https?:\/\//i.test(templateRow.header_handle)
      ? templateRow.header_handle
      : null);

  const mediaKind =
    templateRow?.header_type === 'image' ||
    templateRow?.header_type === 'video' ||
    templateRow?.header_type === 'document'
      ? templateRow.header_type
      : null;

  const buttons = Array.isArray(templateRow?.buttons) ? templateRow!.buttons : [];
  const footerText = templateRow?.footer_text?.trim() || undefined;

  // ── 1. WhatsApp Web (WAHA) ─────────────────────────────────────
  if (wabaId === 'waha') {
    let fullText = resolvedBody;
    if (templateRow?.header_type === 'text' && templateRow.header_content) {
      fullText = `*${templateRow.header_content}*\n\n${fullText}`;
    }

    if (buttons.length > 0) {
      const btnLines: string[] = [];
      for (const btn of buttons) {
        if (btn.type === 'URL' && btn.url) {
          btnLines.push(`🔗 *${btn.text}:* ${btn.url}`);
        } else if (btn.type === 'PHONE_NUMBER' && btn.phone_number) {
          btnLines.push(`📞 *${btn.text}:* ${btn.phone_number}`);
        } else if (btn.type === 'QUICK_REPLY' && btn.text) {
          btnLines.push(`👉 Reply *"${btn.text}"*`);
        }
      }
      if (btnLines.length > 0) {
        fullText = `${fullText}\n\n${btnLines.join('\n')}`;
      }
    }

    if (footerText) {
      fullText = `${fullText}\n\n_${footerText}_`;
    }

    if (mediaUrl && mediaKind) {
      const res = await sendWahaMedia(
        phoneNumberId,
        toPhone,
        mediaUrl,
        mediaKind,
        fullText.trim()
      );
      if (!res.success || !res.messageId) {
        throw new Error(res.error || 'Failed to send WhatsApp Web media message');
      }
      return { messageId: res.messageId };
    }

    const res = await sendWahaText(
      phoneNumberId,
      toPhone,
      fullText.trim() || `[${formatBroadcastTemplateDisplayName(templateName)}]`
    );
    if (!res.success || !res.messageId) {
      throw new Error(res.error || 'Failed to send WhatsApp Web text message');
    }
    return { messageId: res.messageId };
  }

  // ── 2. Custom 24-Hour Window Message on Official Meta Cloud API ─
  if (isCustom) {
    const replyButtons = buttons.filter(
      (b): b is { type: 'QUICK_REPLY'; text: string } =>
        b.type === 'QUICK_REPLY' && Boolean(b.text?.trim())
    );
    const urlButtons = buttons.filter(
      (b): b is { type: 'URL'; text: string; url: string } =>
        b.type === 'URL' && Boolean(b.text?.trim()) && Boolean(b.url?.trim())
    );
    const phoneButtons = buttons.filter(
      (b): b is { type: 'PHONE_NUMBER'; text: string; phone_number: string } =>
        b.type === 'PHONE_NUMBER' &&
        Boolean(b.text?.trim()) &&
        Boolean(b.phone_number?.trim())
    );

    const extraLinks: string[] = [];
    for (const ub of urlButtons) {
      extraLinks.push(`🔗 ${ub.text.trim()}: ${ub.url.trim()}`);
    }
    for (const pb of phoneButtons) {
      extraLinks.push(`📞 ${pb.text.trim()}: ${pb.phone_number.trim()}`);
    }

    // 2a. Interactive Reply Buttons (1–3 buttons, with optional image/video header)
    if (replyButtons.length > 0) {
      const bodyWithLinks =
        extraLinks.length > 0
          ? `${resolvedBody}\n\n${extraLinks.join('\n')}`
          : resolvedBody;

      return sendInteractiveButtons({
        phoneNumberId,
        accessToken,
        to: toPhone,
        bodyText: (bodyWithLinks || ' ').slice(0, 1024),
        headerMedia:
          mediaUrl && mediaKind
            ? { type: mediaKind, link: mediaUrl }
            : undefined,
        footerText: footerText ? footerText.slice(0, 60) : undefined,
        buttons: replyButtons.slice(0, 3).map((b, idx) => ({
          id: `custom_btn_${idx + 1}_${b.text
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .slice(0, 20)}`,
          title: b.text.trim().slice(0, 20),
        })),
      });
    }

    // 2b. Single Interactive CTA URL Button (with optional image/video header)
    if (urlButtons.length === 1 && phoneButtons.length === 0) {
      try {
        return await sendInteractiveCtaUrl({
          phoneNumberId,
          accessToken,
          to: toPhone,
          bodyText: (resolvedBody || ' ').slice(0, 1024),
          displayText: urlButtons[0].text.trim().slice(0, 20),
          url: urlButtons[0].url.trim(),
          headerMedia:
            mediaUrl && mediaKind
              ? { type: mediaKind, link: mediaUrl }
              : undefined,
          footerText: footerText ? footerText.slice(0, 60) : undefined,
        });
      } catch (ctaErr) {
        const msg = ctaErr instanceof Error ? ctaErr.message : '';
        if (isRecipientNotAllowedError(msg)) throw ctaErr;
        // Fallback to standard media/text with link in body
      }
    }

    // 2c. Media (Image / Video) or Plain Text message
    let fullBody =
      extraLinks.length > 0
        ? `${resolvedBody}\n\n${extraLinks.join('\n')}`
        : resolvedBody;
    if (footerText) {
      fullBody = `${fullBody}\n\n_${footerText}_`;
    }

    if (mediaUrl && mediaKind) {
      return sendMediaMessage({
        phoneNumberId,
        accessToken,
        to: toPhone,
        kind: mediaKind,
        link: mediaUrl,
        caption: fullBody.trim().slice(0, 1024) || undefined,
      });
    }

    return sendTextMessage({
      phoneNumberId,
      accessToken,
      to: toPhone,
      text: fullBody.trim() || ' ',
    });
  }

  // ── 3. Approved Meta Template on Official Cloud API ────────────
  return sendTemplateMessage({
    phoneNumberId,
    accessToken,
    to: toPhone,
    templateName,
    language: templateLanguage,
    template: templateRow ?? undefined,
    ...(messageParams ? { messageParams } : {}),
    params,
  });
}

export async function deliverBroadcast(
  db: SupabaseClient,
  plan: BroadcastPlan
): Promise<void> {
  let sentSuccessCount = 0;
  let cursor = 0;
  const total = plan.planned.length;
  const workerCount = Math.min(DELIVER_CONCURRENCY, Math.max(1, total));

  const runWorker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= total) break;
      const recipient = plan.planned[idx];

      if (plan.checkPendingBeforeSend) {
        const { data: current } = await db
          .from('broadcast_recipients')
          .select('status')
          .eq('id', recipient.recipientRowId)
          .maybeSingle();
        if (
          current &&
          current.status !== 'pending' &&
          current.status !== 'failed'
        ) {
          continue;
        }
      }

      const variants =
        plan.wabaId === 'waha'
          ? [recipient.phone]
          : phoneVariants(recipient.phone);
      let sentMessageId: string | null = null;
      let lastError: string | null = null;

      for (const variant of variants) {
        try {
          const result = await sendBroadcastMessageToRecipient({
            wabaId: plan.wabaId,
            phoneNumberId: plan.phoneNumberId,
            accessToken: plan.accessToken,
            toPhone: variant,
            templateName: plan.templateName,
            templateLanguage: plan.templateLanguage,
            templateRow: plan.templateRow,
            params: recipient.params,
            messageParams: plan.messageParams,
          });
          sentMessageId = result.messageId;
          lastError = null;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          lastError = message;
          // Only a "recipient not allowed" error is worth another variant.
          if (!isRecipientNotAllowedError(message)) break;
        }
      }

      if (sentMessageId) {
        sentSuccessCount++;
        const sentAt = new Date().toISOString();
        await db
          .from('broadcast_recipients')
          .update({
            status: 'sent',
            sent_at: sentAt,
            whatsapp_message_id: sentMessageId,
            error_message: null,
          })
          .eq('id', recipient.recipientRowId);

        if (plan.accountId) {
          await recordBroadcastMessageInInbox(db, {
            accountId: plan.accountId,
            recipientRowId: recipient.recipientRowId,
            phone: recipient.phone,
            templateName: plan.templateName,
            templateRow: plan.templateRow,
            params: recipient.params,
            messageParams: plan.messageParams,
            whatsappMessageId: sentMessageId,
            sentAt,
          }).catch(() => {});
        }
      } else {
        await db
          .from('broadcast_recipients')
          .update({
            status: 'failed',
            error_message: lastError || 'Unknown error',
          })
          .eq('id', recipient.recipientRowId);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  // Deduct credits for delivered recipients
  if (plan.accountId && sentSuccessCount > 0) {
    const rates = await getWalletRates();
    const costPerMsg = calculateMessageCost(plan.templateRow?.category, rates);
    const totalDeduct = sentSuccessCount * costPerMsg;
    void deductWalletCredits({
      accountId: plan.accountId,
      amount: totalDeduct,
      referenceType: 'broadcast',
      referenceId: plan.broadcastId,
      description: `Broadcast (${plan.templateName}): ${sentSuccessCount} sent`,
      metadata: {
        broadcastId: plan.broadcastId,
        templateName: plan.templateName,
        sentSuccessCount,
        costPerMsg,
      },
    }).catch((deductErr) => {
      console.warn('[broadcast-core] wallet deduction failed:', deductErr);
    });
  }

  await finalizeBroadcastStatus(db, plan.broadcastId);
}

/**
 * Flip a broadcast out of `sending` once no recipient is left pending.
 *
 * Derived from the recipient rows rather than from a counter local to
 * one delivery pass: a resume (issue #472) delivers only the leftovers,
 * so "nothing sent *this* pass" must not mark a campaign failed when
 * 800 of its 1 000 recipients went out earlier. `failed` means every
 * single recipient failed; anything else that reached Meta is `sent`,
 * with the per-recipient failures visible in `failed_count`.
 *
 * Per-status counts stay trigger-owned (migrations 003/005) — only the
 * terminal `status` is written here.
 */
export async function finalizeBroadcastStatus(
  db: SupabaseClient,
  broadcastId: string
): Promise<void> {
  const countWhere = async (status: string): Promise<number> => {
    const { count } = await db
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcastId)
      .eq('status', status);
    return count ?? 0;
  };

  // Still work outstanding (a capped resume pass) — leave it 'sending'
  // so the UI keeps offering Resume.
  if ((await countWhere('pending')) > 0) return;

  const failed = await countWhere('failed');
  const { count: total } = await db
    .from('broadcast_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('broadcast_id', broadcastId);

  await db
    .from('broadcasts')
    .update({
      status: failed > 0 && failed === (total ?? 0) ? 'failed' : 'sent',
      updated_at: new Date().toISOString(),
    })
    .eq('id', broadcastId);
}

/**
 * Best-effort helper to mirror a sent broadcast message into the Inbox
 * (`conversations` + `messages`) so agents can see the full broadcast
 * template inside each customer's chat thread.
 */
export async function recordBroadcastMessageInInbox(
  db: SupabaseClient,
  input: {
    accountId: string;
    userId?: string | null;
    whatsappConfigId?: string | null;
    contactId?: string | null;
    recipientRowId?: string | null;
    phone: string;
    templateName: string;
    templateRow: MessageTemplate | null;
    params?: string[];
    messageParams?: SendTimeParams;
    whatsappMessageId: string;
    sentAt?: string;
  }
): Promise<void> {
  try {
    let contactId = input.contactId ?? null;
    let userId = input.userId ?? null;
    let whatsappConfigId = input.whatsappConfigId ?? null;

    if (!contactId && input.recipientRowId) {
      const { data: rec } = await db
        .from('broadcast_recipients')
        .select('contact_id, broadcast_id')
        .eq('id', input.recipientRowId)
        .maybeSingle();
      contactId = rec?.contact_id ?? null;
      if (rec?.broadcast_id && (!userId || !whatsappConfigId)) {
        const { data: bc } = await db
          .from('broadcasts')
          .select('user_id, whatsapp_config_id')
          .eq('id', rec.broadcast_id)
          .maybeSingle();
        userId = userId || bc?.user_id || null;
        whatsappConfigId = whatsappConfigId || bc?.whatsapp_config_id || null;
      }
    }

    if (!contactId) {
      const sanitized = sanitizePhoneForMeta(input.phone);
      const { data: contact } = await db
        .from('contacts')
        .select('id, user_id')
        .eq('account_id', input.accountId)
        .or(`phone.eq.${input.phone},phone.eq.+${sanitized},phone.eq.${sanitized}`)
        .limit(1)
        .maybeSingle();
      contactId = contact?.id ?? null;
      userId = userId || contact?.user_id || null;
    }

    if (!contactId) return;

    const config = await resolveWhatsAppNumber(
      db,
      input.accountId,
      whatsappConfigId,
      'id, user_id'
    );
    if (!config) return;

    const ownerUserId = userId || (config as { user_id?: string }).user_id;
    if (!ownerUserId) return;

    const { conversation } = await findOrCreateNumberConversation(db, {
      accountId: input.accountId,
      contactId,
      numberId: config.id,
      userId: ownerUserId,
    });

    const bodyParams = templateBodyParams(input.params, input.messageParams);
    let persistedText =
      templateContentText(
        input.templateRow,
        bodyParams,
        input.templateRow?.body_text ?? null
      ) || '';

    const isCustom = isCustomBroadcastTemplate(input.templateName);
    const buttons = Array.isArray(input.templateRow?.buttons)
      ? input.templateRow!.buttons
      : [];

    if (isCustom && buttons.length > 0) {
      const btnSummary = buttons
        .map((b) => {
          if (b.type === 'URL' && b.url) return `🔗 ${b.text}: ${b.url}`;
          if (b.type === 'PHONE_NUMBER' && b.phone_number)
            return `📞 ${b.text}: ${b.phone_number}`;
          return `[${b.text}]`;
        })
        .join('  ');
      persistedText = persistedText
        ? `${persistedText}\n\n${btnSummary}`
        : btnSummary;
    }

    const mediaUrl =
      input.messageParams?.headerMediaUrl ||
      input.templateRow?.header_media_url ||
      (input.templateRow?.header_handle &&
      /^https?:\/\//i.test(input.templateRow.header_handle)
        ? input.templateRow.header_handle
        : null);

    const nowIso = input.sentAt || new Date().toISOString();
    const contentType = isCustom
      ? mediaUrl
        ? input.templateRow?.header_type === 'video'
          ? 'video'
          : 'image'
        : 'text'
      : 'template';
    const fallbackLabel = isCustom
      ? '[Custom Broadcast]'
      : `[Template: ${input.templateName}]`;

    await db.from('messages').insert({
      conversation_id: conversation.id,
      sender_type: 'agent',
      content_type: contentType,
      content_text: persistedText || fallbackLabel,
      media_url: mediaUrl || null,
      template_name: isCustom ? null : input.templateName,
      message_id: input.whatsappMessageId,
      status: 'sent',
      created_at: nowIso,
    });

    await db
      .from('conversations')
      .update({
        last_message_text: persistedText || fallbackLabel,
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', conversation.id);
  } catch (err) {
    console.warn('[broadcast-inbox] non-blocking sync warning:', err);
  }
}
