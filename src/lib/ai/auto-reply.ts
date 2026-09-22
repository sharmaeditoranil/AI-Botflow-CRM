import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext, loadContactMemory } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage, conversationQueryContext } from './query'
import {
  checkAndExecuteOptOut,
  formatContactMemoryForPrompt,
  processFollowupIntelligence,
} from './intelligence'
import {
  engineSendText,
  loadAccountMetaCredentials,
} from '@/lib/flows/meta-send'
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import {
  sendFacebookMessage,
  sendInstagramMessage,
} from '@/lib/social/meta-social'
import { decrypt } from '@/lib/whatsapp/encryption'
import { triggerMatches } from '@/lib/automations/engine'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
  /** Meta's wamid of the customer message we're replying to. When set,
   *  a typing indicator (which also marks it read) is shown while the
   *  reply is generated. Optional so older callers keep working. */
  inboundMessageId?: string
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    inboundMessageId,
  } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) return

    // Check if the contact has already opted out
    const { data: contactRow } = await db
      .from('contacts')
      .select('is_opted_out')
      .eq('id', contactId)
      .maybeSingle()
    if (contactRow?.is_opted_out) {
      console.log(`[ai auto-reply] Contact ${contactId} is opted out — skipping AI auto-reply.`)
      return
    }

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count, channel')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return
    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return

    const messages = await buildConversationContext(db, conversationId)
    if (messages.length === 0) return

    const latestMsg = latestUserMessage(messages)

    const convChannel = (conv as { channel?: string })?.channel || 'whatsapp'

    // Deterministic automations only send outbound messages on WhatsApp.
    // If inbound is on WhatsApp, check if an active automation will actually send a response
    // for this inbound (e.g. matched keywords or new_message_received with a message action).
    if (convChannel === 'whatsapp') {
      const { data: autoResponders } = await db
        .from('automations')
        .select('id, trigger_type, trigger_config, steps')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .in('trigger_type', ['new_message_received', 'keyword_match'])

      if (autoResponders && autoResponders.length > 0) {
        const willAutomationReply = autoResponders.some((auto: any) => {
          // If steps are specified, check if it sends a message
          const steps = (auto.steps as Array<{ step_type: string }>) || []
          if (steps.length > 0) {
            const sendsMessage = steps.some((s) =>
              ['send_message', 'send_buttons', 'send_list', 'send_template'].includes(s.step_type),
            )
            if (!sendsMessage) return false
          }

          if (!auto.trigger_type || auto.trigger_type === 'new_message_received') return true

          if (auto.trigger_type === 'keyword_match' && latestMsg) {
            return triggerMatches(auto, { message_text: latestMsg })
          }
          return false
        })

        if (willAutomationReply) {
          console.log(
            `[ai auto-reply] Active automation will respond to WhatsApp inbound for account ${accountId} — AI stepping aside.`,
          )
          return
        }
      }
    }

    // Check for customer opt-out / unsubscribe refusal (e.g. "stop", "nahi chahiye", "cancel")
    if (latestMsg && config.followupIntelligenceEnabled && config.autoUnsubscribeEnabled) {
      const optOutResult = await checkAndExecuteOptOut({
        db,
        accountId,
        contactId,
        conversationId,
        customerMessage: latestMsg,
        config,
        configOwnerUserId,
      })
      if (optOutResult.optedOut) {
        return // Opt-out processed; polite confirmation sent and thread closed
      }
    }

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Every gate has passed — we're committed to attempting a reply, so
    // show the customer "typing…" (and mark their message read) while the
    // retrieval + LLM round trips run (WhatsApp only).
    if (inboundMessageId && convChannel === 'whatsapp') {
      await showTypingIndicator(db, accountId, inboundMessageId)
    }

    // Load contact memory & profile for long-term customer awareness
    let contactMemoryPrompt: string | undefined = undefined
    if (config.memoryEnabled) {
      const contactMem = await loadContactMemory(db, contactId)
      if (contactMem) {
        contactMemoryPrompt = formatContactMemoryForPrompt(contactMem)
      }
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const queryContext = conversationQueryContext(messages) || latestMsg
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      queryContext,
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
      contactMemory: contactMemoryPrompt,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)

      // Still evaluate intent (lead qualification & auto-tagging) so human agents have full context
      if (latestMsg && config.followupIntelligenceEnabled) {
        void processFollowupIntelligence({
          db,
          accountId,
          contactId,
          conversationId,
          customerMessage: latestMsg,
          config,
          configOwnerUserId,
        })
      }
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    let isClaimed = claimed === true
    if (claimErr) {
      console.warn('[ai auto-reply] claim_ai_reply_slot RPC failed, attempting fallback update:', claimErr)
      const { data: fallbackConv } = await db
        .from('conversations')
        .update({ ai_reply_count: (conv.ai_reply_count ?? 0) + 1 })
        .eq('id', conversationId)
        .lt('ai_reply_count', config.autoReplyMaxPerConversation)
        .select('id')
      isClaimed = Boolean(fallbackConv && fallbackConv.length > 0)
    }
    if (!isClaimed) return // lost the per-conversation cap race

    if (convChannel === 'facebook' || convChannel === 'instagram') {
      const isFb = convChannel === 'facebook'
      const { data: contact } = await db
        .from('contacts')
        .select('id, fb_user_id, ig_user_id')
        .eq('id', contactId)
        .eq('account_id', accountId)
        .maybeSingle()

      const recipientId = isFb ? contact?.fb_user_id : contact?.ig_user_id

      if (!recipientId) {
        console.error(
          `[ai auto-reply] Contact ${contactId} missing ${
            isFb ? 'fb_user_id' : 'ig_user_id'
          } for ${convChannel} reply`,
        )
        return
      }

      const { data: socialConfig } = await db
        .from('meta_social_config')
        .select('facebook_page_access_token')
        .eq('account_id', accountId)
        .maybeSingle()

      if (!socialConfig?.facebook_page_access_token) {
        console.error(
          `[ai auto-reply] No facebook_page_access_token configured for account ${accountId}`,
        )
        return
      }

      const pageAccessToken = decrypt(socialConfig.facebook_page_access_token)

      const result = isFb
        ? await sendFacebookMessage({
            pageAccessToken,
            recipientId,
            text,
          })
        : await sendInstagramMessage({
            pageAccessToken,
            recipientId,
            text,
          })

      await db.from('messages').insert({
        conversation_id: conversationId,
        channel: convChannel,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        message_id: result.messageId,
        status: 'delivered',
        ai_generated: true,
      })

      await db
        .from('conversations')
        .update({
          last_message_text: text,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    } else {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text,
        aiGenerated: true,
      })
    }

    // Asynchronously process follow-up intelligence (scoring, status, auto-tags, learned memory)
    if (latestMsg && config.followupIntelligenceEnabled) {
      void processFollowupIntelligence({
        db,
        accountId,
        contactId,
        conversationId,
        customerMessage: latestMsg,
        config,
        configOwnerUserId,
      })
    }
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

/**
 * Best-effort "typing…" for the inbound we're about to answer. Swallows
 * every failure (no WhatsApp config, bad token, Meta 4xx) with a warning
 * — the indicator is cosmetic, the reply is not.
 */
async function showTypingIndicator(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  inboundMessageId: string,
): Promise<void> {
  try {
    const { phoneNumberId, accessToken } = await loadAccountMetaCredentials(
      db,
      accountId,
    )
    await sendTypingIndicator({
      phoneNumberId,
      accessToken,
      messageId: inboundMessageId,
    })
  } catch (err) {
    console.warn('[ai auto-reply] typing indicator failed (continuing):', err)
  }
}
