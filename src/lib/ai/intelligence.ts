// ============================================================
// AI Agent Superpowers:
// 1. Conversation Memory (Customer Profile & Long-term Context)
// 2. Lead Qualification (Automated Status & Intent Scoring)
// 3. Follow-up Intelligence (Auto-Tagging & Auto-Unsubscribe / Opt-Out)
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiConfig } from './types';
import { engineSendText } from '@/lib/flows/meta-send';
import { generateWithAdminAi } from './admin-ai';

export interface OptOutCheckResult {
  optedOut: boolean;
  reason?: string;
}

/** Regex patterns for detecting refusal or opt-out in Hindi & English */
const DEFAULT_OPTOUT_REGEXES = [
  /\b(nahi\s*chahiye|nahi\s*lena\s*hai|nahi\s*chahie|nhi\s*chahiye)\b/i,
  /\b(stop|unsubscribe|cancel|optout|opt-out)\b/i,
  /\b(mat\s*bhejo|message\s*mat\s*karo|msg\s*mat\s*karo|text\s*mat\s*karo|call\s*mat\s*karo)\b/i,
  /\b(don'?t\s*(message|text|send|bother|call)|not\s*interested|no\s*thanks|no\s*need)\b/i,
  /\b(number\s*(hatao|delete\s*karo|remove\s*karo))\b/i,
];

/**
 * Check if a customer's message indicates they want to unsubscribe / opt-out,
 * and execute the complete opt-out workflow automatically.
 */
export async function checkAndExecuteOptOut(args: {
  db: SupabaseClient;
  accountId: string;
  contactId: string;
  conversationId: string;
  customerMessage: string;
  config: AiConfig;
  configOwnerUserId: string;
}): Promise<OptOutCheckResult> {
  const {
    db,
    accountId,
    contactId,
    conversationId,
    customerMessage,
    config,
    configOwnerUserId,
  } = args;

  if (!config.followupIntelligenceEnabled || !config.autoUnsubscribeEnabled) {
    return { optedOut: false };
  }

  const text = customerMessage.trim().toLowerCase();
  if (!text) return { optedOut: false };

  // 1. Check against configured keywords
  const userKeywords = config.unsubscribeKeywords || [];
  let isMatch = userKeywords.some((kw) => text.includes(kw.toLowerCase().trim()));

  // 2. Check against robust refusal patterns
  if (!isMatch) {
    isMatch = DEFAULT_OPTOUT_REGEXES.some((rx) => rx.test(text));
  }

  if (!isMatch) return { optedOut: false };

  console.log(`[ai-intelligence] Opt-out detected for contact ${contactId}: "${customerMessage}"`);

  // 3. Mark contact as opted-out in database
  await db
    .from('contacts')
    .update({
      is_opted_out: true,
      opted_out_at: new Date().toISOString(),
      opt_out_reason: customerMessage.slice(0, 255),
      lead_status: 'opted_out',
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  // 4. Find or create the "Unsubscribed" tag and assign to contact
  try {
    const tagName = config.unsubscribeTagName || 'Unsubscribed';
    let tagId: string | null = null;

    const { data: existingTag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .ilike('name', tagName)
      .maybeSingle();

    if (existingTag) {
      tagId = existingTag.id;
    } else {
      const { data: newTag } = await db
        .from('tags')
        .insert({
          account_id: accountId,
          user_id: configOwnerUserId,
          name: tagName,
          color: '#ef4444', // red
        })
        .select('id')
        .maybeSingle();
      tagId = newTag?.id ?? null;
    }

    if (tagId) {
      // Add Unsubscribed tag (idempotent)
      await db
        .from('contact_tags')
        .insert({ contact_id: contactId, tag_id: tagId })
        .select('id')
        .maybeSingle();
    }
  } catch (err) {
    console.warn('[ai-intelligence] Failed to tag contact as unsubscribed:', err);
  }

  // 5. Disable AI auto-reply on this conversation so bot immediately stops messaging
  await db
    .from('conversations')
    .update({
      ai_autoreply_disabled: true,
      ai_handoff_summary: `Customer opted out / unsubscribed: "${customerMessage}"`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // 6. Send polite opt-out confirmation message to customer
  const replyText =
    config.unsubscribeReplyText ||
    'Aapka request note kar liya gaya hai. Aage se aapko hamari taraf se koi automated WhatsApp message nahi aayega. Dhanyawad.';

  try {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: replyText,
      aiGenerated: true,
    });
  } catch (err) {
    console.warn('[ai-intelligence] Failed to send opt-out confirmation text:', err);
  }

  return { optedOut: true, reason: customerMessage };
}

/**
 * Format contact profile & conversation memory into a structured prompt block
 */
export function formatContactMemoryForPrompt(args: {
  contactName?: string | null;
  contactPhone?: string | null;
  company?: string | null;
  leadStatus?: string | null;
  leadScore?: number | null;
  tags?: string[];
  notes?: string[];
  aiMemory?: string | null;
}): string {
  const {
    contactName,
    contactPhone,
    company,
    leadStatus,
    leadScore,
    tags = [],
    notes = [],
    aiMemory,
  } = args;

  const lines: string[] = ['[CUSTOMER PROFILE & CONVERSATION MEMORY]'];

  if (contactName) lines.push(`- Customer Name: ${contactName}`);
  if (contactPhone) lines.push(`- Phone: ${contactPhone}`);
  if (company) lines.push(`- Company / Organization: ${company}`);

  if (leadStatus && leadStatus !== 'new') {
    lines.push(
      `- Lead Status: ${leadStatus.toUpperCase()} (Engagement Score: ${leadScore ?? 0}/100)`
    );
  }

  if (tags.length > 0) {
    lines.push(`- Current Customer Tags: ${tags.join(', ')}`);
  }

  if (notes.length > 0) {
    lines.push(`- CRM Agent Notes: ${notes.slice(0, 3).join(' | ')}`);
  }

  if (aiMemory && aiMemory.trim()) {
    lines.push(`- Past Conversation Context & Learned Preferences: ${aiMemory.trim()}`);
  }

  lines.push(
    'Use this memory naturally when replying (e.g. greet by name, reference past queries if relevant). Never invent past details not shown above.'
  );

  return lines.join('\n');
}

/** Buying intent regex patterns */
const HIGH_INTENT_REGEX =
  /\b(kitna\s*lagega|fee|fees|price|cost|discount|admission|join\s*karna|enroll|payment|pay\s*karna|qr\s*code|bank\s*details|account\s*number|upi|send\s*link|online\s*payment|ready\s*to\s*join|admission\s*lena)\b/i;
const CALLBACK_REGEX =
  /\b(call\s*karo|call\s*me|baat\s*karni\s*hai|phone\s*pe\s*baat|contact\s*me|number\s*par\s*call|please\s*call)\b/i;
const QUALIFIED_REGEX =
  /\b(payment\s*done|screenshot|paid|bhej\s*diya|admission\s*done|registered|seat\s*book|booked)\b/i;
const GENERAL_INTEREST_REGEX =
  /\b(syllabus|details|timing|batch|duration|address|location|certificate|course|demo|information)\b/i;

/** Helper to assign a tag idempotently to a contact */
async function ensureTagAssigned(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  configOwnerUserId: string,
  tagName: string,
  color: string = '#f59e0b'
) {
  try {
    let tagId: string | null = null;
    const { data: existingTag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .ilike('name', tagName)
      .limit(1);

    if (existingTag && existingTag.length > 0) {
      tagId = existingTag[0].id;
    } else {
      const { data: newTag } = await db
        .from('tags')
        .insert({
          account_id: accountId,
          user_id: configOwnerUserId,
          name: tagName,
          color,
        })
        .select('id')
        .limit(1);
      tagId = newTag && newTag.length > 0 ? newTag[0].id : null;
    }

    if (tagId) {
      const { data: existingLink } = await db
        .from('contact_tags')
        .select('id')
        .eq('contact_id', contactId)
        .eq('tag_id', tagId)
        .limit(1);

      if (!existingLink || existingLink.length === 0) {
        await db.from('contact_tags').insert({
          contact_id: contactId,
          tag_id: tagId,
        });
      }
    }
  } catch (err) {
    console.warn(`[ai-intelligence] Failed to assign tag "${tagName}":`, err);
  }
}

/** Helper to remove a tag from a contact */
async function ensureTagRemoved(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  tagName: string
) {
  try {
    const { data: existingTag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .ilike('name', tagName)
      .limit(1);

    if (existingTag && existingTag.length > 0) {
      await db
        .from('contact_tags')
        .delete()
        .eq('contact_id', contactId)
        .eq('tag_id', existingTag[0].id);
    }
  } catch (err) {
    console.warn(`[ai-intelligence] Failed to remove tag "${tagName}":`, err);
  }
}

/**
 * Analyzes customer message with Master Admin AI for smart lead qualification,
 * auto-assigns Interested / Not Interested tags, and guarantees exactly 1 Deal
 * per customer in the CRM Pipeline (updates existing deal instead of duplicating).
 */
export async function processFollowupIntelligence(args: {
  db: SupabaseClient;
  accountId: string;
  contactId: string;
  conversationId: string;
  customerMessage: string;
  config: AiConfig;
  configOwnerUserId: string;
}): Promise<void> {
  const { db, accountId, contactId, conversationId, customerMessage, config, configOwnerUserId } = args;

  if (!config.followupIntelligenceEnabled) return;

  const text = customerMessage.trim();
  if (!text) return;

  // 1. Fetch current contact data
  const { data: contact } = await db
    .from('contacts')
    .select('id, name, phone, lead_status, lead_score, ai_memory, is_opted_out')
    .eq('id', contactId)
    .maybeSingle();

  if (!contact || contact.is_opted_out) return;

  // 2. CSAT Survey Response Auto-Handler
  const ratingMatch =
    text.match(/^(?:⭐|rating|rate)?\s*([1-5])\s*(?:⭐|stars?|star)?$/i) ||
    text.match(/^([1-5])$/);

  if (ratingMatch) {
    const ratingValue = parseInt(ratingMatch[1], 10);
    try {
      const { data: account } = await db
        .from('accounts')
        .select('csat_enabled, google_review_url')
        .eq('id', accountId)
        .maybeSingle();

      if (account?.csat_enabled) {
        await db.from('csat_responses').insert({
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          rating: ratingValue,
          feedback: text,
        });

        if (ratingValue >= 4 && account.google_review_url) {
          const reviewMsg =
            `Thank you so much for the ${'⭐'.repeat(ratingValue)} rating! 🥰 It truly means the world to our team.\n\n` +
            `Could you please take 30 seconds to support us by leaving a review on Google?\n` +
            `👉 ${account.google_review_url}\n\n` +
            `We really appreciate your time and support! 🙏`;

          await db.from('messages').insert({
            conversation_id: conversationId,
            sender_type: 'bot',
            content: reviewMsg,
            status: 'sent',
          });
        } else if (ratingValue <= 3) {
          const apologyMsg =
            `Thank you for your honest feedback. 🙏 We're truly sorry that your experience wasn't 5-star quality today.\n\n` +
            `Our support lead has been notified and will reach out to ensure your concerns are resolved.`;

          await db.from('messages').insert({
            conversation_id: conversationId,
            sender_type: 'bot',
            content: apologyMsg,
            status: 'sent',
          });
        }
      }
    } catch (csatErr) {
      console.warn('[ai-intelligence] CSAT handler notice:', csatErr);
    }
  }

  // 3. Automated Lead Qualification & Tagging Toggle Check
  const dealsEnabled = config.leadQualificationEnabled !== false;
  const tagsEnabled = config.autoTaggingEnabled !== false;

  if (!dealsEnabled && !tagsEnabled) {
    // Both automated pipeline deals and auto-tagging are disabled by user.
    return;
  }

  // 4. Zero-Duplication Check: Query all existing open deals for this contact in the account
  let existingDeal: any = null;
  if (dealsEnabled) {
    const { data: existingDeals } = await db
      .from('deals')
      .select('id, notes, title, stage_id, status, expected_close_date')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .in('status', ['open', 'active'])
      .order('created_at', { ascending: false });

    // Self-heal: If multiple open deals exist for this contact, delete older duplicates
    if (existingDeals && existingDeals.length > 1) {
      const dupeIds = existingDeals.slice(1).map((d: any) => d.id);
      await db.from('deals').delete().in('id', dupeIds);
    }
    existingDeal = existingDeals && existingDeals.length > 0 ? existingDeals[0] : null;
  }

  // 5. Smart Intent Analysis using Master Admin AI (OpenAI / Gemini from platform_settings)
  const { data: recentMsgs } = await db
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: accountTags } = await db
    .from('tags')
    .select('name')
    .eq('account_id', accountId);

  const tagList = accountTags?.map((t: any) => t.name).join(', ') || 'Interested, Not Interested, High Intent, New Lead';

  let isInterested = false;
  let sentiment: 'interested' | 'not_interested' | 'neutral' = 'neutral';
  let tagToApply: string | null = null;
  let tagToRemove: string | null = null;
  let summary = `Inquiry: "${text.slice(0, 100)}"`;

  try {
    const historySnippet = (recentMsgs || [])
      .reverse()
      .map((m: any) => `${m.sender_type === 'customer' ? 'Customer' : 'Bot'}: ${m.content_text || ''}`)
      .join('\n');

    const prompt = `Analyze this WhatsApp customer message in context and return JSON:
Context of conversation:
${historySnippet || 'None'}

Current incoming customer message: "${text}"
Available tags in CRM: [${tagList}]

Instructions:
1. Is this customer expressing genuine commercial interest, asking for price, quote, demo, details, or service? (is_interested: true/false)
2. If customer is saying no, stop, don't message, not interested, cancel (sentiment: "not_interested", is_interested: false)
3. If customer is asking for prices, products, service, booking, buying (sentiment: "interested", is_interested: true)
4. Casual greeting like "hi", "hello", "ok", or questions unrelated to purchase should have is_interested: false, sentiment: "neutral"
5. Set tag_to_apply ("Interested" or "Not Interested" or matching one from CRM tags), tag_to_remove (e.g. remove "Not Interested" if interested), and a 1-sentence summary in English/Hinglish.

Return ONLY raw valid JSON:
{
  "is_interested": boolean,
  "sentiment": "interested" | "not_interested" | "neutral",
  "tag_to_apply": string | null,
  "tag_to_remove": string | null,
  "summary": string
}`;

    const rawAi = await generateWithAdminAi(prompt, {
      systemPrompt: 'You are an expert CRM Lead Qualification and Sentiment Analysis AI. Return only valid JSON.',
    });

    const cleanJson = rawAi.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (typeof parsed.is_interested === 'boolean') isInterested = parsed.is_interested;
    if (parsed.sentiment) sentiment = parsed.sentiment;
    if (parsed.tag_to_apply) tagToApply = parsed.tag_to_apply;
    if (parsed.tag_to_remove) tagToRemove = parsed.tag_to_remove;
    if (parsed.summary) summary = parsed.summary;
  } catch (aiErr) {
    console.warn('[ai-intelligence] Admin AI qualification notice, using rule fallback:', aiErr);
    if (
      QUALIFIED_REGEX.test(text) ||
      HIGH_INTENT_REGEX.test(text) ||
      GENERAL_INTEREST_REGEX.test(text) ||
      CALLBACK_REGEX.test(text)
    ) {
      isInterested = true;
      sentiment = 'interested';
      tagToApply = 'Interested';
      tagToRemove = 'Not Interested';
      summary = `Customer interested: "${text.slice(0, 80)}"`;
    } else if (DEFAULT_OPTOUT_REGEXES.some((rx) => rx.test(text))) {
      isInterested = false;
      sentiment = 'not_interested';
      tagToApply = 'Not Interested';
      tagToRemove = 'Interested';
      summary = `Customer indicated not interested: "${text.slice(0, 80)}"`;
    }
  }

  // 6. Execute Automatic Tagging (Controlled by tagsEnabled toggle)
  if (tagsEnabled) {
    if (tagToRemove) {
      await ensureTagRemoved(db, accountId, contactId, tagToRemove);
    }
    if (tagToApply) {
      const tagColor = tagToApply.toLowerCase().includes('not') ? '#ef4444' : '#f59e0b';
      await ensureTagAssigned(db, accountId, contactId, configOwnerUserId, tagToApply, tagColor);
    }
  }

  // 7. Deal Management (Controlled by dealsEnabled toggle, Guaranteed Single Deal per Customer)
  if (dealsEnabled) {
    const todayStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    if (existingDeal) {
      // 1-Customer 1-Deal Guarantee: Update existing deal, never create a duplicate!
      if (isInterested) {
        const updatedNotes = existingDeal.notes
          ? `${existingDeal.notes}\n[AI Update ${todayStr}]: ${summary}`
          : `[AI Lead]: ${summary}`;
        await db
          .from('deals')
          .update({
            notes: updatedNotes,
            conversation_id: conversationId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingDeal.id);
      } else if (sentiment === 'not_interested') {
        const updatedNotes = existingDeal.notes
          ? `${existingDeal.notes}\n[AI Note ${todayStr}]: Customer indicated not interested (${summary})`
          : `Customer indicated not interested (${summary})`;
        await db
          .from('deals')
          .update({
            notes: updatedNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingDeal.id);
      }
    } else {
      // No existing deal exists. ONLY create a deal if customer is genuinely interested!
      if (isInterested) {
        let { data: pipeline } = await db
          .from('pipelines')
          .select('id, stages:pipeline_stages(id, position)')
          .eq('account_id', accountId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!pipeline) {
          const { data: fallbackPipe } = await db
            .from('pipelines')
            .select('id, stages:pipeline_stages(id, position)')
            .eq('user_id', configOwnerUserId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          pipeline = fallbackPipe;
        }

        if (pipeline && pipeline.stages && (pipeline.stages as any[]).length > 0) {
          const sortedStages = (pipeline.stages as any[]).sort((a: any, b: any) => a.position - b.position);
          const firstStage = sortedStages[0];

          const followUpDate = new Date();
          followUpDate.setDate(followUpDate.getDate() + 2);

          const dealTitle = `Deal: ${(contact as any)?.name || (contact as any)?.phone || 'Inbound Lead'}`;

          await db.from('deals').insert({
            user_id: configOwnerUserId,
            account_id: accountId,
            pipeline_id: pipeline.id,
            stage_id: firstStage.id,
            contact_id: contactId,
            conversation_id: conversationId,
            title: dealTitle,
            value: 5000,
            currency: 'INR',
            status: 'open',
            expected_close_date: followUpDate.toISOString().split('T')[0],
            notes: `[AI Qualified Lead]: ${summary}`,
            ai_followup_enabled: true,
          });
        }
      }
      // If isInterested is false (casual greeting, spam, etc.), DO NOT insert any deal!
    }
  }

  // 8. Update Contact AI Memory, Status, and Score
  let currentStatus = contact.lead_status || 'new';
  let currentScore = contact.lead_score || 0;
  if (isInterested) {
    currentStatus = 'hot';
    currentScore = Math.max(currentScore, 85);
  } else if (sentiment === 'not_interested') {
    currentStatus = 'lost';
    currentScore = Math.min(currentScore, 10);
  }

  let updatedMemory = contact.ai_memory || '';
  if (text.length > 5 && !updatedMemory.toLowerCase().includes(text.toLowerCase().slice(0, 30))) {
    const memorySnippet = `Customer inquiry: "${summary}"`;
    updatedMemory = updatedMemory ? `${updatedMemory} | ${memorySnippet}`.slice(-400) : memorySnippet;
  }

  await db
    .from('contacts')
    .update({
      lead_status: currentStatus,
      lead_score: currentScore,
      ai_memory: updatedMemory,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);
}
