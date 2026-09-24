import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  getRazorpayCredentials,
  verifyRazorpayWebhookSignature,
} from '@/lib/billing/razorpay';
import {
  processIncomingWebhook,
  findSmartPhone,
  findSmartName,
} from '@/lib/webhooks/incoming-trigger';
import { executeAutomation } from '@/lib/automations/engine';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
  }

  const rawBody = await req.text();
  const { webhookSecret } = await getRazorpayCredentials();
  const adminSupabase = getAdminSupabase();

  if (webhookSecret) {
    let isValid = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
    // If not matching global secret, check against active webhook bot secrets
    if (!isValid) {
      const { data: triggers } = await adminSupabase
        .from('webhook_triggers')
        .select('secret_key')
        .eq('is_active', true);
      if (triggers && triggers.length > 0) {
        for (const t of triggers) {
          if (t.secret_key && verifyRazorpayWebhookSignature(rawBody, signature, t.secret_key)) {
            isValid = true;
            break;
          }
        }
      }
    }
    if (!isValid) {
      console.error('[Razorpay Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const eventType = event.event;
  const payload = event.payload || {};

  console.log(`[Razorpay Webhook] Processing event: ${eventType}`);

  // Handle payment captured or order paid
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const payment = payload.payment?.entity;
    const notes = payment?.notes || {};
    const accountId = notes.accountId || notes.account_id;
    const planId = notes.planId || notes.plan_id;
    const billingCycle = notes.billingCycle || notes.billing_cycle || 'monthly';

    // 1. Internal CRM subscription billing update (if applicable)
    if (accountId && planId) {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + (billingCycle === 'yearly' ? 365 : 30));

      await adminSupabase
        .from('accounts')
        .update({
          plan_id: planId,
          subscription_status: 'active',
          current_period_end: periodEnd.toISOString(),
          is_suspended: false,
        })
        .eq('id', accountId);

      await adminSupabase.from('invoices').insert({
        account_id: accountId,
        amount: (payment.amount || 0) / 100,
        currency: payment.currency || 'INR',
        status: 'paid',
        gateway_payment_id: payment.id,
        gateway_invoice_id: payment.order_id,
      });
    }

    // 2. Dispatch to customer-facing WhatsApp Webhook Bots and Automations
    try {
      const recipientPhone = findSmartPhone(event);
      const recipientName = findSmartName(event);
      const paymentId = payment?.id;

      console.log(`[Razorpay Webhook] Payment captured details: phone=${recipientPhone}, name=${recipientName}, paymentId=${paymentId}`);

      if (recipientPhone) {
        // Query active webhook triggers
        let triggerQuery = adminSupabase
          .from('webhook_triggers')
          .select('*')
          .eq('is_active', true);

        if (accountId) {
          triggerQuery = triggerQuery.eq('account_id', accountId);
        }

        const { data: triggers } = await triggerQuery;

        if (triggers && triggers.length > 0) {
          const matchedTriggers = triggers.filter((t) => {
            const nameLower = (t.name || '').toLowerCase();
            const tmplLower = (t.template_name || '').toLowerCase();
            const isFail = nameLower.includes('fail') || tmplLower.includes('fail');
            if (isFail) return false;
            return (
              nameLower.includes('payment') ||
              nameLower.includes('paid') ||
              nameLower.includes('comp') ||
              nameLower.includes('succ') ||
              tmplLower.includes('payment') ||
              tmplLower.includes('paid') ||
              tmplLower.includes('succ')
            );
          });

          for (const trigger of matchedTriggers) {
            try {
              // Deduplicate if this exact payment ID was already triggered in the last 5 minutes
              if (paymentId) {
                const { data: existingLogs } = await adminSupabase
                  .from('webhook_trigger_logs')
                  .select('id, request_payload')
                  .eq('trigger_id', trigger.id)
                  .eq('status', 'success')
                  .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
                  .limit(5);

                const alreadyProcessed = existingLogs?.some((log: any) =>
                  JSON.stringify(log.request_payload || {}).includes(paymentId)
                );
                if (alreadyProcessed) {
                  console.log(`[Razorpay Webhook] Trigger ${trigger.name} already processed payment ${paymentId}, skipping duplicate`);
                  continue;
                }
              }

              console.log(`[Razorpay Webhook] Dispatching to webhook bot "${trigger.name}" (${trigger.id}) for ${recipientPhone}`);
              const res = await processIncomingWebhook(
                adminSupabase,
                trigger.id,
                event,
                trigger.secret_key,
                {
                  isTest: false,
                  overrideRecipientPhone: recipientPhone,
                  overrideRecipientName: recipientName || undefined,
                }
              );
              console.log(`[Razorpay Webhook] Webhook bot dispatched successfully: ${res.whatsappMessageId}`);
            } catch (triggerErr: any) {
              console.error(`[Razorpay Webhook] Error triggering bot ${trigger.id}:`, triggerErr.message || triggerErr);
            }
          }
        }

        // Query active workflow automations
        let automationQuery = adminSupabase
          .from('automations')
          .select('*')
          .eq('is_active', true)
          .eq('trigger_type', 'incoming_webhook');

        if (accountId) {
          automationQuery = automationQuery.eq('account_id', accountId);
        }

        const { data: automations } = await automationQuery;

        if (automations && automations.length > 0) {
          const matchedAutomations = automations.filter((a) => {
            const nameLower = (a.name || '').toLowerCase();
            const isFail = nameLower.includes('fail');
            if (isFail) return false;
            return (
              nameLower.includes('payment') ||
              nameLower.includes('paid') ||
              nameLower.includes('succ') ||
              nameLower.includes('comp')
            );
          });

          for (const auto of matchedAutomations) {
            try {
              const resolved = await resolveConversationByPhone(
                adminSupabase,
                auto.account_id,
                recipientPhone,
                recipientName || 'Customer'
              );

              console.log(`[Razorpay Webhook] Executing automation "${auto.name}" (${auto.id}) for conversation ${resolved.conversationId}`);
              await executeAutomation(auto as any, {
                accountId: auto.account_id,
                triggerType: 'incoming_webhook',
                contactId: resolved.contactId,
                context: {
                  conversation_id: resolved.conversationId,
                  vars: {
                    ...(event as Record<string, unknown>),
                    phone: recipientPhone,
                    name: recipientName,
                    payment_id: payment?.id,
                    amount: payment?.amount ? (payment.amount / 100).toFixed(2) : undefined,
                    currency: payment?.currency || 'INR',
                  },
                },
              });
              console.log(`[Razorpay Webhook] Automation "${auto.name}" completed successfully`);
            } catch (autoErr: any) {
              console.error(`[Razorpay Webhook] Error executing automation ${auto.id}:`, autoErr.message || autoErr);
            }
          }
        }
      } else {
        console.warn('[Razorpay Webhook] No customer phone found in payment event. Checked payment.entity.contact, notes, card.');
      }
    } catch (dispatchErr: any) {
      console.error('[Razorpay Webhook] Error in payment dispatching:', dispatchErr);
    }
  } else if (eventType === 'payment.failed') {
    const payment = payload.payment?.entity;
    const notes = payment?.notes || {};
    const accountId = notes.accountId || notes.account_id;

    if (accountId) {
      await adminSupabase.from('invoices').insert({
        account_id: accountId,
        amount: (payment.amount || 0) / 100,
        currency: payment.currency || 'INR',
        status: 'failed',
        gateway_payment_id: payment.id,
        gateway_invoice_id: payment.order_id,
      });
    }

    // Dispatch to customer-facing WhatsApp Webhook Bots and Automations for failed payment
    try {
      const recipientPhone = findSmartPhone(event);
      const recipientName = findSmartName(event);

      console.log(`[Razorpay Webhook] Payment failed details: phone=${recipientPhone}, name=${recipientName}`);

      if (recipientPhone) {
        let triggerQuery = adminSupabase
          .from('webhook_triggers')
          .select('*')
          .eq('is_active', true);

        if (accountId) {
          triggerQuery = triggerQuery.eq('account_id', accountId);
        }

        const { data: triggers } = await triggerQuery;

        if (triggers && triggers.length > 0) {
          const matchedTriggers = triggers.filter((t) => {
            const nameLower = (t.name || '').toLowerCase();
            const tmplLower = (t.template_name || '').toLowerCase();
            return nameLower.includes('fail') || tmplLower.includes('fail');
          });

          for (const trigger of matchedTriggers) {
            try {
              console.log(`[Razorpay Webhook] Triggering fail bot "${trigger.name}" (${trigger.id}) for ${recipientPhone}`);
              await processIncomingWebhook(
                adminSupabase,
                trigger.id,
                event,
                trigger.secret_key,
                {
                  isTest: false,
                  overrideRecipientPhone: recipientPhone,
                  overrideRecipientName: recipientName || undefined,
                }
              );
            } catch (triggerErr: any) {
              console.error(`[Razorpay Webhook] Failed executing trigger ${trigger.id}:`, triggerErr.message || triggerErr);
            }
          }
        }

        // Query active workflow automations
        let automationQuery = adminSupabase
          .from('automations')
          .select('*')
          .eq('is_active', true)
          .eq('trigger_type', 'incoming_webhook');

        if (accountId) {
          automationQuery = automationQuery.eq('account_id', accountId);
        }

        const { data: automations } = await automationQuery;

        if (automations && automations.length > 0) {
          const matchedAutomations = automations.filter((a) => {
            const nameLower = (a.name || '').toLowerCase();
            return nameLower.includes('fail');
          });

          for (const auto of matchedAutomations) {
            try {
              const resolved = await resolveConversationByPhone(
                adminSupabase,
                auto.account_id,
                recipientPhone,
                recipientName || 'Customer'
              );

              await executeAutomation(auto as any, {
                accountId: auto.account_id,
                triggerType: 'incoming_webhook',
                contactId: resolved.contactId,
                context: {
                  conversation_id: resolved.conversationId,
                  vars: {
                    ...(event as Record<string, unknown>),
                    phone: recipientPhone,
                    name: recipientName,
                    payment_id: payment?.id,
                  },
                },
              });
            } catch (autoErr: any) {
              console.error(`[Razorpay Webhook] Failed executing fail automation ${auto.id}:`, autoErr.message || autoErr);
            }
          }
        }
      }
    } catch (dispatchErr: any) {
      console.error('[Razorpay Webhook] Error in payment.failed dispatching:', dispatchErr);
    }
  }

  return NextResponse.json({ received: true });
}
