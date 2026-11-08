import crypto from 'crypto'
import type { Automation, SendWebhookStepConfig } from '@/types'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'
import {
  extractLeadSummary,
  extractValueByPath,
  findSmartCity,
  findSmartEmail,
  findSmartMessage,
  findSmartName,
  findSmartService,
} from '@/lib/webhooks/incoming-trigger'
import type { AutomationContext } from './engine'

export interface OutboundWebhookExecutionInput {
  cfg: SendWebhookStepConfig
  automation: Pick<Automation, 'id' | 'name' | 'trigger_type' | 'account_id'>
  contact?: {
    id?: string | null
    name?: string | null
    phone?: string | null
    email?: string | null
    company?: string | null
    custom_fields?: Record<string, unknown> | null
  } | null
  context: AutomationContext
  interpolate: (template: string) => string
}

export interface OutboundWebhookExecutionResult {
  ok: boolean
  status: number
  statusText: string
  durationMs: number
  requestUrl: string
  requestMethod: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseBody: string
  mappedVariables: Record<string, string>
  attempts: number
  error?: string
}

function setNestedKey(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return
  if (parts.length === 1) {
    target[parts[0]] = value
    return
  }
  let curr: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (!curr[key] || typeof curr[key] !== 'object' || Array.isArray(curr[key])) {
      curr[key] = {}
    }
    curr = curr[key] as Record<string, unknown>
  }
  curr[parts[parts.length - 1]] = value
}

/**
 * Build the universal smart payload containing contact, message, lead, conversation,
 * and workflow variables.
 */
export function buildUniversalSmartPayload(
  input: OutboundWebhookExecutionInput,
  customFieldsMap: Record<string, unknown> = {}
): Record<string, unknown> {
  const { automation, contact, context } = input
  const vars = (context.vars ?? {}) as Record<string, unknown>
  const leadSummary = extractLeadSummary(vars)

  const resolvedName =
    contact?.name ||
    (vars.name as string) ||
    findSmartName(vars) ||
    'Customer'
  const resolvedPhone =
    contact?.phone ||
    (vars.phone as string) ||
    ''
  const resolvedEmail =
    contact?.email ||
    (vars.email as string) ||
    findSmartEmail(vars) ||
    null
  const resolvedService =
    (vars.service as string) ||
    leadSummary.service ||
    findSmartService(vars) ||
    null
  const resolvedCity =
    (vars.city as string) ||
    leadSummary.city ||
    findSmartCity(vars) ||
    null
  const resolvedMessage =
    context.message_text ||
    (vars.message as string) ||
    leadSummary.message ||
    findSmartMessage(vars) ||
    null

  return {
    event: 'whatsapp.automation.webhook',
    timestamp: new Date().toISOString(),
    automation: {
      id: automation.id,
      name: automation.name,
      trigger_type: automation.trigger_type,
    },
    contact: {
      id: contact?.id ?? null,
      name: resolvedName,
      phone: resolvedPhone,
      email: resolvedEmail,
      company: contact?.company ?? null,
      custom_fields: contact?.custom_fields ?? {},
    },
    conversation: {
      id: context.conversation_id ?? null,
    },
    message: {
      text: context.message_text ?? null,
      interactive_reply_id: context.interactive_reply_id ?? null,
    },
    lead: {
      name: resolvedName,
      phone: resolvedPhone,
      email: resolvedEmail,
      service: resolvedService,
      city: resolvedCity,
      message: resolvedMessage,
      summary: leadSummary.formattedNote || null,
    },
    variables: vars,
    ...(Object.keys(customFieldsMap).length > 0 ? { custom_data: customFieldsMap, ...customFieldsMap } : {}),
  }
}

/**
 * Executes a Universal Outbound Webhook step with SSRF protection, authentication,
 * custom headers, payload modes, retries, and response variable extraction.
 */
export async function executeUniversalOutboundWebhook(
  input: OutboundWebhookExecutionInput
): Promise<OutboundWebhookExecutionResult> {
  const { cfg, context, interpolate } = input
  const startTime = Date.now()

  const rawUrl = cfg.url ? interpolate(cfg.url).trim() : ''
  if (!rawUrl) {
    throw new Error('send_webhook needs url')
  }

  // Build URL with optional query_params
  let finalUrl = rawUrl
  if (Array.isArray(cfg.query_params) && cfg.query_params.length > 0) {
    try {
      const parsedUrl = new URL(rawUrl)
      for (const qp of cfg.query_params) {
        const k = (qp.key || '').trim()
        if (!k) continue
        const v = interpolate(qp.value ?? '')
        parsedUrl.searchParams.set(k, v)
      }
      finalUrl = parsedUrl.toString()
    } catch {
      // Let SSRF / URL check handle invalid URLs below
    }
  }

  // SSRF guard: block private / loopback / link-local / metadata addresses
  if (!(await isDeliverableUrl(finalUrl))) {
    throw new Error('send_webhook: destination not allowed')
  }

  const method = (cfg.method || 'POST').toUpperCase()
  const isGetOrDelete = method === 'GET' || method === 'DELETE'

  // Determine payload mode (preserve legacy behavior when body_template is provided without payload_mode)
  const payloadMode =
    cfg.payload_mode ||
    (cfg.body_template && cfg.body_template.trim().length > 0 ? 'json' : 'auto')

  // Evaluate custom body_fields
  const customFieldsObj: Record<string, unknown> = {}
  const flatCustomPairs: Array<[string, string]> = []
  if (Array.isArray(cfg.body_fields)) {
    for (const item of cfg.body_fields) {
      const k = (item.key || '').trim()
      if (!k) continue
      const val = interpolate(item.value ?? '')
      flatCustomPairs.push([k, val])
      setNestedKey(customFieldsObj, k, val)
    }
  }

  // Build request body and content-type
  let requestBody: string | null = null
  let contentType = cfg.content_type || 'application/json'

  if (!isGetOrDelete) {
    if (payloadMode === 'form' || contentType === 'application/x-www-form-urlencoded') {
      contentType = 'application/x-www-form-urlencoded'
      const params = new URLSearchParams()
      if (flatCustomPairs.length > 0) {
        for (const [k, v] of flatCustomPairs) {
          params.append(k, v)
        }
      } else {
        const smart = buildUniversalSmartPayload(input)
        params.append('event', String(smart.event))
        params.append('timestamp', String(smart.timestamp))
        params.append('name', String((smart.contact as any)?.name ?? ''))
        params.append('phone', String((smart.contact as any)?.phone ?? ''))
        if ((smart.contact as any)?.email) params.append('email', String((smart.contact as any).email))
        if ((smart.message as any)?.text) params.append('message', String((smart.message as any).text))
        if ((smart.lead as any)?.service) params.append('service', String((smart.lead as any).service))
        if ((smart.lead as any)?.city) params.append('city', String((smart.lead as any).city))
      }
      requestBody = params.toString()
    } else if (payloadMode === 'key_value') {
      contentType = 'application/json'
      if (cfg.include_system_payload) {
        requestBody = JSON.stringify(buildUniversalSmartPayload(input, customFieldsObj))
      } else {
        requestBody = JSON.stringify(customFieldsObj)
      }
    } else if (payloadMode === 'json') {
      contentType = 'application/json'
      if (cfg.body_template && cfg.body_template.trim().length > 0) {
        requestBody = interpolate(cfg.body_template)
      } else {
        // Legacy fallback when body_template is empty
        requestBody = JSON.stringify(context)
      }
    } else {
      // 'auto' mode: Universal Smart Payload (or legacy JSON.stringify(context) if explicitly bare)
      contentType = 'application/json'
      if (cfg.payload_mode === 'auto' || flatCustomPairs.length > 0) {
        requestBody = JSON.stringify(buildUniversalSmartPayload(input, customFieldsObj))
      } else {
        // Backwards compatible default when neither payload_mode nor body_template was set
        requestBody = JSON.stringify({
          ...buildUniversalSmartPayload(input, customFieldsObj),
          ...context,
        })
      }
    }
  }

  // Build headers
  const headers: Record<string, string> = {}
  if (!isGetOrDelete) {
    headers['content-type'] = contentType
  }
  headers['user-agent'] = 'AIBotFlow-Webhook/2.0'

  // Legacy headers object
  if (cfg.headers && typeof cfg.headers === 'object') {
    for (const [k, v] of Object.entries(cfg.headers)) {
      if (k && v !== undefined && v !== null) {
        headers[k.trim()] = interpolate(String(v))
      }
    }
  }

  // Dynamic header_items array
  if (Array.isArray(cfg.header_items)) {
    for (const h of cfg.header_items) {
      const k = (h.key || '').trim()
      if (!k) continue
      headers[k] = interpolate(h.value ?? '')
    }
  }

  // Authentication presets
  const authType = cfg.auth_type || 'none'
  if (authType === 'bearer' && cfg.auth_token) {
    const token = interpolate(cfg.auth_token).trim()
    if (token) {
      headers['Authorization'] = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`
    }
  } else if (authType === 'api_key' && cfg.api_key_value) {
    const headerName = (cfg.api_key_header || 'X-API-Key').trim() || 'X-API-Key'
    headers[headerName] = interpolate(cfg.api_key_value).trim()
  } else if (authType === 'basic' && (cfg.basic_username || cfg.basic_password)) {
    const user = interpolate(cfg.basic_username || '')
    const pass = interpolate(cfg.basic_password || '')
    const encoded = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')
    headers['Authorization'] = `Basic ${encoded}`
  } else if (authType === 'hmac_sha256' && cfg.hmac_secret) {
    const secret = interpolate(cfg.hmac_secret)
    const sigHeader = (cfg.hmac_header || 'X-Webhook-Signature').trim() || 'X-Webhook-Signature'
    const payloadToSign = requestBody ?? finalUrl
    const digest = crypto.createHmac('sha256', secret).update(payloadToSign, 'utf8').digest('hex')
    headers[sigHeader] = `sha256=${digest}`
  }

  const timeoutMs = Math.min(30_000, Math.max(1_000, Number(cfg.timeout_ms) || 10_000))
  const maxRetries = Math.min(3, Math.max(0, Number(cfg.retry_count) || 0))

  let lastStatus = 0
  let lastStatusText = ''
  let lastResponseBody = ''
  let lastError: string | undefined
  let attempts = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt))
    }

    try {
      const res = await fetch(finalUrl, {
        method,
        headers,
        body: isGetOrDelete ? undefined : (requestBody ?? undefined),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      })

      lastStatus = res.status
      lastStatusText = res.statusText || ''
      try {
        lastResponseBody = typeof res.text === 'function' ? await res.text() : ''
      } catch {
        lastResponseBody = ''
      }

      if (res.ok) {
        // Extract response_mappings if JSON response
        const mappedVariables: Record<string, string> = {}
        if (
          Array.isArray(cfg.response_mappings) &&
          cfg.response_mappings.length > 0 &&
          lastResponseBody
        ) {
          try {
            const parsedJson = JSON.parse(lastResponseBody)
            if (parsedJson && typeof parsedJson === 'object') {
              if (!context.vars) context.vars = {}
              for (const mapping of cfg.response_mappings) {
                const respPath = (mapping.response_path || '').trim()
                const varName = (mapping.variable_name || '').trim()
                if (!respPath || !varName) continue
                const extracted = extractValueByPath(parsedJson, respPath)
                if (extracted !== null && extracted !== undefined) {
                  mappedVariables[varName] = extracted
                  const cleanVar = varName.replace(/^vars\./, '')
                  context.vars[cleanVar] = extracted
                  context.vars[`vars.${cleanVar}`] = extracted
                }
              }
            }
          } catch {
            // Non-JSON response; skip response variable extraction safely
          }
        }

        return {
          ok: true,
          status: lastStatus,
          statusText: lastStatusText,
          durationMs: Date.now() - startTime,
          requestUrl: finalUrl,
          requestMethod: method,
          requestHeaders: headers,
          requestBody,
          responseBody: lastResponseBody.slice(0, 4000),
          mappedVariables,
          attempts,
        }
      }

      lastError = `webhook returned ${res.status}`
      // Only retry on 429 or 5xx server errors
      if (res.status !== 429 && res.status < 500) {
        break
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  return {
    ok: false,
    status: lastStatus,
    statusText: lastStatusText,
    durationMs: Date.now() - startTime,
    requestUrl: finalUrl,
    requestMethod: method,
    requestHeaders: headers,
    requestBody,
    responseBody: lastResponseBody.slice(0, 4000),
    mappedVariables: {},
    attempts,
    error: lastError || `webhook returned ${lastStatus}`,
  }
}
