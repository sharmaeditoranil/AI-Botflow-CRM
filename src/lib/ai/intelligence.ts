// ============================================================
// AI Agent Superpowers:
// 1. Conversation Memory (Customer Profile & Long-term Context)
// 2. Lead Qualification (Automated Status & Intent Scoring)
// 3. Follow-up Intelligence (Auto-Tagging & Auto-Unsubscribe / Opt-Out)
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiConfig } from './types';
import { engineSendText } from '@/lib/flows/meta-send';

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

/**
 * Analyzes customer message for lead qualification and follow-up intelligence,
 * updates lead status/score, auto-assigns tags, and updates AI memory.
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
  const { db, accountId, contactId, customerMessage, config, configOwnerUserId } = args;

  if (!config.followupIntelligenceEnabled) return;

  const text = customerMessage.trim();
  if (!text) return;

  // 1. Fetch current contact data
  const { data: contact } = await db
    .from('contacts')
    .select('id, lead_status, lead_score, ai_memory, is_opted_out')
    .eq('id', contactId)
    .maybeSingle();

  if (!contact || contact.is_opted_out) return;

  let currentScore = contact.lead_score || 0;
  let currentStatus = contact.lead_status || 'new';
  const tagsToAdd: string[] = [];

  // 2. Evaluate intent & criteria
  if (QUALIFIED_REGEX.test(text)) {
    currentStatus = 'qualified';
    currentScore = Math.max(currentScore, 95);
    tagsToAdd.push(config.qualifiedTagName || 'Qualified Lead');
  } else if (HIGH_INTENT_REGEX.test(text)) {
    if (currentStatus !== 'qualified') currentStatus = 'hot';
    currentScore = Math.max(currentScore, 85);
    if (config.autoTaggingEnabled) {
      tagsToAdd.push('High Intent');
    }
  } else if (CALLBACK_REGEX.test(text)) {
    if (currentStatus === 'new') currentStatus = 'warm';
    currentScore = Math.max(currentScore, 75);
    if (config.autoTaggingEnabled) {
      tagsToAdd.push('Callback Requested');
    }
  } else if (GENERAL_INTEREST_REGEX.test(text)) {
    if (currentStatus === 'new') currentStatus = 'warm';
    currentScore = Math.max(currentScore, 55);
    if (config.autoTaggingEnabled) {
      tagsToAdd.push('Interested');
    }
  }

  // 3. Update AI Memory with running summary (keeping under 400 chars)
  let updatedMemory = contact.ai_memory || '';
  if (text.length > 5 && !updatedMemory.toLowerCase().includes(text.toLowerCase().slice(0, 30))) {
    const memorySnippet = `Customer asked: "${text.slice(0, 80)}"`;
    if (!updatedMemory) {
      updatedMemory = memorySnippet;
    } else {
      updatedMemory = `${updatedMemory} | ${memorySnippet}`.slice(-400);
    }
  }

  // 4. Update contact row
  await db
    .from('contacts')
    .update({
      lead_status: currentStatus,
      lead_score: currentScore,
      ai_memory: updatedMemory,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  // 5. Auto-assign tags
  for (const tagName of tagsToAdd) {
    try {
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
        const color =
          tagName.includes('High') || tagName.includes('Hot')
            ? '#f97316' // orange
            : tagName.includes('Qualified')
            ? '#10b981' // green
            : '#3b82f6'; // blue
        const { data: newTag } = await db
          .from('tags')
          .insert({
            account_id: accountId,
            user_id: configOwnerUserId,
            name: tagName,
            color,
          })
          .select('id')
          .maybeSingle();
        tagId = newTag?.id ?? null;
      }

      if (tagId) {
        await db
          .from('contact_tags')
          .insert({ contact_id: contactId, tag_id: tagId })
          .select('id')
          .maybeSingle();
      }
    } catch (err) {
      console.warn(`[ai-intelligence] Failed to auto-assign tag "${tagName}":`, err);
    }
  }
}
