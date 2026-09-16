import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'

interface DbMessage {
  sender_type: 'customer' | 'agent' | 'bot'
  content_text: string | null
}

/**
 * Fetch the last N text messages of a conversation and map them to the
 * provider-neutral chat shape. Customer messages become `user`; agent
 * and bot messages become `assistant`. Non-text messages (media,
 * templates, interactive) are excluded — they carry no text to model.
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_text')
    .eq('conversation_id', conversationId)
    .eq('content_type', 'text')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()
  return rows
    .filter((m) => m.content_text && m.content_text.trim())
    .map((m) => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: m.content_text!.trim(),
    }))
}

export interface ContactMemoryContext {
  contactName?: string | null
  contactPhone?: string | null
  company?: string | null
  leadStatus?: string | null
  leadScore?: number | null
  tags?: string[]
  notes?: string[]
  aiMemory?: string | null
}

/**
 * Load contact profile, tags, notes, and past memory for cross-session context.
 */
export async function loadContactMemory(
  db: SupabaseClient,
  contactId?: string | null,
): Promise<ContactMemoryContext | null> {
  if (!contactId) return null

  try {
    const [contactRes, tagsRes, notesRes] = await Promise.all([
      db
        .from('contacts')
        .select('name, phone, company, lead_status, lead_score, ai_memory')
        .eq('id', contactId)
        .maybeSingle(),
      db
        .from('contact_tags')
        .select('tags(name)')
        .eq('contact_id', contactId),
      db
        .from('contact_notes')
        .select('content')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(3),
    ])

    if (!contactRes.data) return null

    const tags = (tagsRes.data || [])
      .map((t: any) => t.tags?.name)
      .filter(Boolean)

    const notes = (notesRes.data || [])
      .map((n: any) => n.content)
      .filter(Boolean)

    return {
      contactName: contactRes.data.name,
      contactPhone: contactRes.data.phone,
      company: contactRes.data.company,
      leadStatus: contactRes.data.lead_status,
      leadScore: contactRes.data.lead_score,
      tags,
      notes,
      aiMemory: contactRes.data.ai_memory,
    }
  } catch (err) {
    console.warn('[ai-context] Failed to load contact memory:', err)
    return null
  }
}

