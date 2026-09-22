import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Call OpenAI's Chat Completions endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateOpenAi(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  const isLegacyModel =
    model.startsWith('gpt-3.5') ||
    model === 'gpt-4' ||
    model.startsWith('gpt-4-0') ||
    model.startsWith('gpt-4-turbo')
  const baseBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...mergeConsecutive(messages),
    ],
  }

  const sendRequest = async (useMaxCompletionTokens: boolean) => {
    const body: Record<string, unknown> = { ...baseBody }
    if (useMaxCompletionTokens) {
      body.max_completion_tokens = MAX_OUTPUT_TOKENS
    } else {
      body.max_tokens = MAX_OUTPUT_TOKENS
    }
    return fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  }

  let res: Response
  try {
    res = await sendRequest(!isLegacyModel)
    if (!res.ok && res.status === 400) {
      const cloned = res.clone()
      const errJson = (await cloned.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      const msg = errJson?.error?.message || ''
      if (
        msg.includes('max_tokens') ||
        msg.includes('max_completion_tokens') ||
        msg.includes('unsupported_parameter')
      ) {
        res = await sendRequest(isLegacyModel)
      }
    }
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('OpenAI', res)
  }

  const data = (await res.json().catch(() => null)) as OpenAiResponse | null
  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError('OpenAI returned an empty response.', {
      code: 'empty_response',
    })
  }
  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })
  return { text, usage }
}
