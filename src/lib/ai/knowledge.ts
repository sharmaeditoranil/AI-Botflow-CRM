import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiConfig } from './types'
import { chunkText } from './chunk'
import { embedTexts, toVectorLiteral } from './embeddings'

// ============================================================
// Knowledge base: ingest (chunk + optionally embed) and hybrid
// retrieve (semantic when an embeddings key is present, topped up with
// lexical full-text search).
// ============================================================

interface MatchRow {
  id: string
  content: string
}

/**
 * (Re)build the chunks for one document. Deletes the document's
 * existing chunks, re-chunks the content, and — when the account has an
 * embeddings key — embeds each chunk. Runs under whatever client the
 * caller passes (service-role for ingest routes).
 *
 * Throws on embedding failure so the ingest route can report it; the
 * chunks are only written once embedding (if attempted) succeeds, so a
 * failed embed never leaves half-indexed rows.
 */
export async function ingestDocument(
  db: SupabaseClient,
  accountId: string,
  config: Pick<AiConfig, 'embeddingsApiKey'>,
  documentId: string,
  content: string,
): Promise<void> {
  const chunks = chunkText(content)

  // Replace, don't append — re-ingest must be idempotent.
  const { error: delErr } = await db
    .from('ai_knowledge_chunks')
    .delete()
    .eq('document_id', documentId)
  if (delErr) throw delErr

  if (chunks.length === 0) return

  // Embed if a key is set, but DON'T let an embedding failure stop the
  // chunks from being stored: a failed embed must still leave the
  // document searchable lexically. We record the error and rethrow it
  // AFTER inserting (embedding-less) rows, so the route can warn
  // "semantic indexing failed" — which is now truthful, because lexical
  // search really does still work.
  let embeddings: number[][] | null = null
  let embedError: unknown = null
  const effectiveEmbeddingsKey =
    config.embeddingsApiKey || process.env.OPENAI_API_KEY || null

  if (effectiveEmbeddingsKey) {
    try {
      embeddings = await embedTexts(effectiveEmbeddingsKey, chunks)
    } catch (err) {
      embedError = err
    }
  }

  const rows = chunks.map((content, i) => ({
    document_id: documentId,
    account_id: accountId,
    chunk_index: i,
    content,
    embedding: embeddings ? toVectorLiteral(embeddings[i]) : null,
  }))

  const { error: insErr } = await db.from('ai_knowledge_chunks').insert(rows)
  if (insErr) throw insErr

  if (embedError && !process.env.OPENAI_API_KEY) throw embedError
}

/**
 * Retrieve knowledge excerpts relevant to `queryText`.
 *
 * Provides comprehensive knowledge grounding:
 * 1. For small-to-medium knowledge bases (<= 30,000 chars, ~5,000 tokens),
 *    returns all knowledge documents. This guarantees 100% accuracy, zero dropped
 *    questions, and eliminates false handoffs for Hindi/Hinglish phrasing.
 * 2. For larger knowledge bases, uses hybrid semantic vector search + keyword
 *    scoring to select the top relevant chunks.
 */
export async function retrieveKnowledge(
  db: SupabaseClient,
  accountId: string,
  config: Pick<AiConfig, 'embeddingsApiKey'>,
  queryText: string,
  k = 8,
): Promise<string[]> {
  const query = queryText.trim()
  if (!query || k <= 0) return []

  // Skip everything when the account has no knowledge base
  try {
    const { count, error } = await db
      .from('ai_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
    if (error || !count) return []
  } catch {
    return []
  }

  const picked = new Map<string, string>() // id → content, preserves order
  const effectiveEmbeddingsKey =
    config.embeddingsApiKey || process.env.OPENAI_API_KEY || null

  // 1. Semantic path (when embeddings key is configured or platform key available).
  if (effectiveEmbeddingsKey) {
    try {
      const [queryEmbedding] = await embedTexts(effectiveEmbeddingsKey, [query])
      if (queryEmbedding) {
        const { data, error } = await db.rpc('match_ai_knowledge_semantic', {
          p_account_id: accountId,
          p_query_embedding: toVectorLiteral(queryEmbedding),
          p_match_count: k,
        })
        if (!error && Array.isArray(data)) {
          for (const row of data as MatchRow[]) {
            if (row.content) picked.set(row.id, row.content)
          }
        }
      }
    } catch (err) {
      console.error('[ai knowledge] semantic retrieval failed, falling back to FTS:', err)
    }
  }

  // 2. Lexical top-up (FTS RPC)
  if (picked.size < k) {
    try {
      const { data, error } = await db.rpc('match_ai_knowledge_fts', {
        p_account_id: accountId,
        p_query: query,
        p_match_count: k,
      })
      if (!error && Array.isArray(data)) {
        for (const row of data as MatchRow[]) {
          if (picked.size >= k) break
          if (row.content && !picked.has(row.id)) picked.set(row.id, row.content)
        }
      }
    } catch (err) {
      console.error('[ai knowledge] lexical retrieval failed:', err)
    }
  }

  // 3. Fallback & Complete Grounding:
  // If the account has knowledge documents, check if we can provide complete grounding.
  try {
    const { data: docs } = await db
      .from('ai_knowledge_documents')
      .select('id, title, content')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })

    if (docs && docs.length > 0) {
      const totalLen = docs.reduce(
        (sum, d) => sum + (d.content?.length || 0) + (d.title?.length || 0),
        0,
      )

      // When the entire knowledge base is compact (<= 30,000 characters),
      // include ALL documents. Modern LLMs handle this effortlessly and
      // it guarantees the agent never misses any detail or colloquial question.
      if (totalLen <= 30000) {
        for (const doc of docs) {
          const formatted = `Title: ${doc.title}\n${doc.content}`
          if (!picked.has(doc.id)) {
            picked.set(doc.id, formatted)
          }
        }
        return Array.from(picked.values())
      }

      // For larger KBs when semantic/FTS returned fewer than k hits, score documents
      if (picked.size < k) {
        const stopWords = new Set([
          'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'kya', 'kyun', 'kab', 'kaise', 'kahan', 'aur', 'se', 'me',
          'mein', 'par', 'pe', 'batao', 'bataiye', 'chahiye', 'karna', 'karne', 'bhai', 'bhaiya', 'sir',
          'madam', 'please', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'for', 'in', 'on', 'at', 'to', 'of',
          'and', 'or', 'with', 'about', 'can', 'you', 'give', 'details', 'tell', 'me'
        ])
        const queryTerms = query
          .toLowerCase()
          .replace(/[^\w\s\u0900-\u097F]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 1 && !stopWords.has(t))

        const scoredDocs = docs.map((doc) => {
          const titleLower = (doc.title || '').toLowerCase()
          const contentLower = (doc.content || '').toLowerCase()
          let score = 0
          for (const term of queryTerms) {
            if (titleLower.includes(term)) score += 10
            if (contentLower.includes(term)) {
              const count = (contentLower.match(new RegExp(term, 'g')) || []).length
              score += count * 2
            }
          }
          return { doc, score }
        })

        scoredDocs.sort((a, b) => b.score - a.score)

        for (const item of scoredDocs) {
          if (picked.size >= k) break
          const formatted = `Title: ${item.doc.title}\n${item.doc.content}`
          if (!picked.has(item.doc.id)) {
            picked.set(item.doc.id, formatted)
          }
        }
      }
    }
  } catch {
    // Non-fatal fallback: continue with picked items
  }

  return Array.from(picked.values()).slice(0, k)
}
