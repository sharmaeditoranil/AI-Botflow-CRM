import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { executeUniversalOutboundWebhook } from '@/lib/automations/outbound-webhook'
import { extractValueByPath } from '@/lib/webhooks/incoming-trigger'
import type { AutomationTriggerType, SendWebhookStepConfig } from '@/types'

export async function POST(request: Request) {
  try {
    await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const accountId = (profile?.account_id as string | undefined) || 'test-account'

  const body = await request.json().catch(() => null)
  if (!body || !body.step_config) {
    return NextResponse.json({ error: 'Missing step_config' }, { status: 400 })
  }

  const cfg = body.step_config as SendWebhookStepConfig
  const samplePayload = (body.sample_payload || {}) as Record<string, unknown>

  const sampleVars: Record<string, unknown> = {
    name: samplePayload.name || 'Rahul Sharma',
    phone: samplePayload.phone || '+919876543210',
    email: samplePayload.email || 'rahul@example.com',
    company: 'AI BotFlow Demo',
    service: samplePayload.service || 'WhatsApp Automation Pro',
    city: samplePayload.city || 'Mumbai',
    message: samplePayload.message || 'Hi, I am interested in your WhatsApp API service.',
    amount: samplePayload.amount || '1499',
    order_id: samplePayload['order.id'] || 'order_TEST98765',
    payment_id: samplePayload['payment.id'] || 'pay_TEST12345',
    ...samplePayload,
  }

  const interpolateTest = (template: string): string => {
    return template.replace(/\{\{\s*([\w.\s-]+)\s*\}\}/g, (_, rawKey) => {
      const key = String(rawKey).trim()
      const lower = key.toLowerCase()

      if (lower.startsWith('webhook.')) {
        const sub = key.slice(8).trim()
        const fromSample = extractValueByPath(sampleVars, sub)
        if (fromSample !== null && fromSample !== undefined) return String(fromSample)
      }
      if (lower === 'contact.name' || lower === 'name') return String(sampleVars.name)
      if (lower === 'contact.phone' || lower === 'phone' || lower === 'mobile') return String(sampleVars.phone)
      if (lower === 'contact.email' || lower === 'email') return String(sampleVars.email)
      if (lower === 'contact.company' || lower === 'company') return String(sampleVars.company)
      if (lower === 'message.text' || lower === 'message') return String(sampleVars.message)
      if (lower === 'service' || lower === 'vars.service') return String(sampleVars.service)
      if (lower === 'city' || lower === 'vars.city') return String(sampleVars.city)

      const val = extractValueByPath(sampleVars, key)
      if (val !== null && val !== undefined) return String(val)
      return `sample_${key.replace(/\W+/g, '_')}`
    })
  }

  try {
    const result = await executeUniversalOutboundWebhook({
      cfg,
      automation: {
        id: body.automation_id || 'test_automation_id',
        name: body.automation_name || 'Test Automation',
        trigger_type: (body.trigger_type as AutomationTriggerType) || 'new_message_received',
        account_id: accountId,
      },
      contact: {
        id: 'cnt_test_12345',
        name: String(sampleVars.name),
        phone: String(sampleVars.phone),
        email: String(sampleVars.email),
        company: String(sampleVars.company),
        custom_fields: { source: 'whatsapp_automation_test' },
      },
      context: {
        conversation_id: 'conv_test_12345',
        message_text: String(sampleVars.message),
        vars: sampleVars,
        webhook_payload: samplePayload,
      },
      interpolate: interpolateTest,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        status: 0,
        statusText: 'Error',
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    )
  }
}
