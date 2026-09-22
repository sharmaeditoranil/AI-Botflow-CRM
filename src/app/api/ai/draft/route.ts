import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadAiConfig } from '@/lib/ai/config'
import { buildConversationContext } from '@/lib/ai/context'
import { retrieveKnowledge } from '@/lib/ai/knowledge'
import { generateReply } from '@/lib/ai/generate'
import { buildSystemPrompt } from '@/lib/ai/defaults'
import { latestUserMessage, conversationQueryContext } from '@/lib/ai/query'
import { logAiUsage } from '@/lib/ai/usage'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { AiError } from '@/lib/ai/types'

/**
 * POST /api/ai/draft  (agent+)
 *
 * Body: { conversation_id }
 * Returns: { draft } — a suggested reply for the agent to edit + send.
 *
 * Uses the account's configured provider/key (BYO). Read-only: it never
 * sends or stores anything, just hands text back to the composer.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const userLimit = checkRateLimit(`ai-draft:${userId}`, RATE_LIMITS.aiDraft)
    if (!userLimit.success) return rateLimitResponse(userLimit)
    // Also cap the whole team's draws on the shared BYO provider key.
    const accountLimit = checkRateLimit(
      `ai-draft-acct:${accountId}`,
      RATE_LIMITS.aiDraftAccount,
    )
    if (!accountLimit.success) return rateLimitResponse(accountLimit)

    const body = await request.json().catch(() => null)
    const conversationId =
      body && typeof body.conversation_id === 'string' ? body.conversation_id : ''
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 },
      )
    }

    // RLS scopes the SSR client to the caller's account, so a missing
    // row means "not yours / not found" either way.
    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr) {
      console.error('[ai/draft] conversation lookup error:', convErr)
      return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
    }
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const config = await loadAiConfig(supabase, accountId).catch((err) => {
      // Decrypt failure — surface distinctly from "not configured".
      console.error('[ai/draft] loadAiConfig error:', err)
      return null
    })

    // If tenant has no custom key, fall back to Admin Master AI API
    if (!config) {
      const messages = await buildConversationContext(supabase, conversationId)
      if (messages.length === 0) {
        return NextResponse.json(
          { error: 'No messages to draft from yet.', code: 'no_messages' },
          { status: 400 },
        )
      }

      const conversationText = messages
        .map((m) => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`)
        .join('\n')

      const draftPrompt = `Read this WhatsApp conversation and suggest a professional, polite, helpful reply to the customer in the same language (Hindi/English/Hinglish):
${conversationText}

Provide only the reply text, no preamble or quotes.`

      try {
        const { generateWithAdminAi } = await import('@/lib/ai/admin-ai')
        const draft = await generateWithAdminAi(draftPrompt, {
          systemPrompt: 'You are a helpful customer support assistant drafting a response for a human agent.',
          maxTokens: 250,
        })
        return NextResponse.json({ draft })
      } catch (adminAiErr: any) {
        return NextResponse.json(
          { error: adminAiErr.message || 'AI assistant is not configured on platform.' },
          { status: 400 },
        )
      }
    }

    const messages = await buildConversationContext(supabase, conversationId)
    // Nothing to draft from — a brand-new thread with no customer text
    // would otherwise produce a nonsensical reply-to-nothing.
    if (messages.length === 0) {
      return NextResponse.json(
        {
          error: 'No messages to draft from yet.',
          code: 'no_messages',
        },
        { status: 400 },
      )
    }

    // Ground the draft in the account's knowledge base (best-effort —
    // returns [] when there's no KB or retrieval fails).
    const queryContext = conversationQueryContext(messages) || latestUserMessage(messages)
    const knowledge = await retrieveKnowledge(
      supabase,
      accountId,
      config,
      queryContext,
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'draft',
      knowledge,
    })

    const { text, usage } = await generateReply({ config, systemPrompt, messages })

    // Record spend on the account's BYO key. Best-effort + via the
    // service role (the log has no `authenticated` INSERT policy). This
    // must not fail or delay the draft the agent is waiting on, so:
    //  - the whole thing is wrapped (constructing the admin client throws
    //    if the service-role key is unset — that must not 500 the draft);
    //  - it's fire-and-forget (`void`), not awaited, so the response
    //    isn't held for a DB round-trip.
    try {
      void logAiUsage(supabaseAdmin(), {
        accountId,
        conversationId,
        mode: 'draft',
        provider: config.provider,
        model: config.model,
        usage,
      })
    } catch (logErr) {
      console.error('[ai/draft] usage log skipped:', logErr)
    }

    return NextResponse.json({ draft: text })
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      )
    }
    return toErrorResponse(err)
  }
}
