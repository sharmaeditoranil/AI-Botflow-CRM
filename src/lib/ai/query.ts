import type { ChatMessage } from './types'

/**
 * The text to retrieve knowledge against: the most recent customer
 * (`user`) turn in the conversation context. Falls back to the last
 * message of any role, then empty string. Shared by the draft route and
 * the auto-reply bot so both query the knowledge base the same way.
 */
export function latestUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return messages.length > 0 ? messages[messages.length - 1].content : ''
}

/**
 * Composite query context across recent turns (e.g. user question + clarification).
 * Preserves vital context like "Course fees?" -> "Offline" so retrieval matches both.
 */
export function conversationQueryContext(messages: ChatMessage[]): string {
  if (!messages || messages.length === 0) return ''
  const recent = messages
    .slice(-4)
    .map((m) => m.content?.trim())
    .filter(Boolean)
  return recent.join(' ') || latestUserMessage(messages)
}

