import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  deliverBroadcast,
  finalizeBroadcastStatus,
} from '@/lib/whatsapp/broadcast-core';
import {
  claimBroadcastDelivery,
  markBroadcastSending,
  planBroadcastResume,
  releaseBroadcastDelivery,
} from '@/lib/whatsapp/broadcast-resume';
import {
  resolveVariables,
  type AudienceConfig,
  type VariableMapping,
} from '@/hooks/use-broadcast-sending';
import { fetchAllRows, fetchInChunks } from '@/lib/supabase/fetch-all';
import { normalizeKey } from '@/lib/contacts/dedupe';
import { fetchActive24hContactIds } from '@/lib/whatsapp/custom-broadcast';
import type { Contact } from '@/types';

export const maxDuration = 300;

const INSERT_BATCH_SIZE = 200;

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * This sweep runs with the service role across every account, so it is
 * scheduler-only: the caller must present AUTOMATION_CRON_SECRET (same
 * secret and header conventions as /api/automations/cron). Fails closed
 * when the secret isn't configured.
 */
function isAuthorizedCron(req: NextRequest): boolean {
  const expected = process.env.AUTOMATION_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const supplied =
    req.headers.get('x-cron-secret') ||
    bearerToken ||
    req.nextUrl.searchParams.get('secret') ||
    '';

  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  return suppliedBuf.length === expectedBuf.length && timingSafeEqual(suppliedBuf, expectedBuf);
}

/**
 * Ensure a scheduled broadcast has its `broadcast_recipients` rows
 * populated. Broadcasts scheduled via the updated wizard already insert
 * their recipient rows up front; broadcasts scheduled before that (or
 * inserted directly into `broadcasts` with `total_recipients = 0`) have
 * their audience resolved here from `audience_filter` + `template_variables`.
 */
async function ensureBroadcastRecipients(
  adminDb: SupabaseClient,
  broadcast: Record<string, any>
): Promise<number> {
  const { count: existingCount } = await adminDb
    .from('broadcast_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('broadcast_id', broadcast.id);

  if ((existingCount ?? 0) > 0) {
    return existingCount ?? 0;
  }

  const accountId = broadcast.account_id as string;
  const userId = broadcast.user_id as string;
  const audience: AudienceConfig =
    broadcast.audience_filter && typeof broadcast.audience_filter === 'object'
      ? broadcast.audience_filter
      : { type: 'all' };
  const variables: Record<string, VariableMapping> =
    broadcast.template_variables && typeof broadcast.template_variables === 'object'
      ? broadcast.template_variables
      : {};

  let contacts: Contact[] = [];

  if (audience.type === 'all' || !audience.type) {
    contacts = await fetchAllRows<Contact>((from, to) =>
      adminDb
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('id')
        .range(from, to)
    );
  } else if (audience.type === 'active_24h') {
    const activeIds = await fetchActive24hContactIds(adminDb, accountId);
    if (activeIds.length > 0) {
      contacts = await fetchInChunks<string, Contact>(activeIds, (ids) =>
        adminDb
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .in('id', ids)
      );
    }
  } else if (audience.type === 'tags' && Array.isArray(audience.tagIds) && audience.tagIds.length > 0) {
    const tagIds = audience.tagIds;
    const contactTags = await fetchAllRows<{ contact_id: string }>((from, to) =>
      adminDb
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', tagIds)
        .order('id')
        .range(from, to)
    );
    if (contactTags.length > 0) {
      const uniqueIds = [...new Set(contactTags.map((ct) => ct.contact_id))];
      contacts = await fetchInChunks<string, Contact>(uniqueIds, (ids) =>
        adminDb
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .in('id', ids)
      );
    }
  } else if (audience.type === 'custom_field' && audience.customField) {
    const { fieldId, operator, value } = audience.customField;
    const matches = await fetchAllRows<{ contact_id: string }>((from, to) => {
      let query = adminDb
        .from('contact_custom_values')
        .select('contact_id')
        .eq('custom_field_id', fieldId);
      if (operator === 'is') query = query.eq('value', value);
      else if (operator === 'is_not') query = query.neq('value', value);
      else if (operator === 'contains') query = query.ilike('value', `%${value}%`);
      return query.order('id').range(from, to);
    });
    const contactIds = [...new Set(matches.map((m) => m.contact_id))];
    if (contactIds.length > 0) {
      contacts = await fetchInChunks<string, Contact>(contactIds, (ids) =>
        adminDb
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .in('id', ids)
      );
    }
  } else if (audience.type === 'csv' && Array.isArray(audience.csvContacts) && audience.csvContacts.length > 0) {
    const uniqueByKey = new Map<string, { phone: string; name?: string }>();
    for (const row of audience.csvContacts) {
      const key = normalizeKey(row.phone);
      if (key && !uniqueByKey.has(key)) uniqueByKey.set(key, row);
    }
    const keys = [...uniqueByKey.keys()];
    const existing = await fetchInChunks<string, Contact>(keys, (chunk) =>
      adminDb
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .in('phone_normalized', chunk)
    );
    const byKey = new Map<string, Contact>();
    for (const c of existing) {
      const key = normalizeKey(c.phone ?? '');
      if (key) byKey.set(key, c);
    }
    const missing = keys
      .filter((k) => !byKey.has(k))
      .map((k) => uniqueByKey.get(k)!)
      .map((row) => ({
        user_id: userId,
        account_id: accountId,
        phone: row.phone,
        name: row.name ?? null,
      }));
    for (let i = 0; i < missing.length; i += INSERT_BATCH_SIZE) {
      const chunk = missing.slice(i, i + INSERT_BATCH_SIZE);
      const { data: inserted } = await adminDb
        .from('contacts')
        .insert(chunk)
        .select();
      for (const c of (inserted ?? []) as Contact[]) {
        const key = normalizeKey(c.phone ?? '');
        if (key) byKey.set(key, c);
      }
    }
    contacts = keys
      .map((k) => byKey.get(k))
      .filter((c): c is Contact => Boolean(c));
  }

  if (Array.isArray(audience.excludeTagIds) && audience.excludeTagIds.length > 0) {
    const excludeTagIds = audience.excludeTagIds;
    const excludeRows = await fetchAllRows<{ contact_id: string }>((from, to) =>
      adminDb
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', excludeTagIds)
        .order('id')
        .range(from, to)
    );
    const excludedIds = new Set(excludeRows.map((r) => r.contact_id));
    contacts = contacts.filter((c) => !excludedIds.has(c.id));
  }

  contacts = contacts.filter((c) => !c.is_opted_out);

  const seenContactIds = new Set<string>();
  const seenPhoneKeys = new Set<string>();
  const uniqueContacts: Contact[] = [];
  for (const c of contacts) {
    if (!c.id || seenContactIds.has(c.id)) continue;
    const phoneKey = normalizeKey(c.phone ?? '');
    if (phoneKey) {
      if (seenPhoneKeys.has(phoneKey)) continue;
      seenPhoneKeys.add(phoneKey);
    }
    seenContactIds.add(c.id);
    uniqueContacts.push(c);
  }

  if (uniqueContacts.length === 0) {
    return 0;
  }

  // Load custom field values for variable resolution
  const customValueIndex = new Map<string, Map<string, string>>();
  const customVals = await fetchInChunks<
    string,
    { contact_id: string; custom_field_id: string; value: string | null }
  >(
    uniqueContacts.map((c) => c.id),
    (slice) =>
      adminDb
        .from('contact_custom_values')
        .select('contact_id, custom_field_id, value')
        .in('contact_id', slice)
  );
  for (const row of customVals) {
    const bucket = customValueIndex.get(row.contact_id) ?? new Map<string, string>();
    bucket.set(row.custom_field_id, row.value ?? '');
    customValueIndex.set(row.contact_id, bucket);
  }

  const recipientRows = uniqueContacts.map((contact) => ({
    broadcast_id: broadcast.id,
    contact_id: contact.id,
    status: 'pending' as const,
    template_params: resolveVariables(
      variables,
      contact,
      customValueIndex.get(contact.id)
    ),
  }));

  for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
    const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
    const { error: insertErr } = await adminDb
      .from('broadcast_recipients')
      .insert(batch);
    if (insertErr) {
      throw new Error(`Failed to insert scheduled broadcast recipients: ${insertErr.message}`);
    }
  }

  await adminDb
    .from('broadcasts')
    .update({
      total_recipients: uniqueContacts.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', broadcast.id);

  return uniqueContacts.length;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminDb = getAdminSupabase();
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const stalledCutoff = new Date(nowDate.getTime() - 2 * 60 * 1000).toISOString();

    // 1. Find broadcasts where status is 'scheduled' and scheduled_at <= now
    const { data: scheduledBroadcasts, error } = await adminDb
      .from('broadcasts')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .limit(10);

    if (error) {
      console.error('[process-scheduled] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Also pick up stalled 'sending' broadcasts whose browser tab stopped
    //    updating for >= 2 minutes so abandoned campaigns auto-complete.
    const { data: stalledBroadcasts } = await adminDb
      .from('broadcasts')
      .select('*')
      .eq('status', 'sending')
      .lte('updated_at', stalledCutoff)
      .limit(10);

    const candidates = [
      ...(scheduledBroadcasts ?? []),
      ...(stalledBroadcasts ?? []),
    ];

    if (candidates.length === 0) {
      return NextResponse.json({ message: 'No scheduled broadcasts pending.', processed: 0 });
    }

    const results = [];

    for (const broadcast of candidates) {
      const claimed = await claimBroadcastDelivery(
        adminDb,
        broadcast.account_id,
        broadcast.id,
        nowDate
      );
      if (!claimed) {
        continue;
      }

      try {
        await markBroadcastSending(adminDb, broadcast.id);

        const recipientCount = await ensureBroadcastRecipients(adminDb, broadcast);
        if (recipientCount === 0) {
          await adminDb
            .from('broadcasts')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', broadcast.id);
          results.push({ id: broadcast.id, name: broadcast.name, status: 'failed', reason: 'no_recipients' });
          continue;
        }

        // Drain all 'pending' recipients in 1,000-row passes
        while (true) {
          try {
            const { plan } = await planBroadcastResume(
              adminDb,
              broadcast.account_id,
              broadcast.id,
              'pending',
              { checkPendingBeforeSend: true }
            );
            if (plan.planned.length === 0) break;
            await deliverBroadcast(adminDb, plan);
          } catch (planErr: any) {
            if (planErr?.code === 'nothing_to_resume') {
              await finalizeBroadcastStatus(adminDb, broadcast.id);
              break;
            }
            throw planErr;
          }

          const { count: pendingLeft } = await adminDb
            .from('broadcast_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('broadcast_id', broadcast.id)
            .eq('status', 'pending');

          if (!pendingLeft || pendingLeft === 0) {
            await finalizeBroadcastStatus(adminDb, broadcast.id);
            break;
          }
        }

        const { data: updatedBc } = await adminDb
          .from('broadcasts')
          .select('status, sent_count, failed_count')
          .eq('id', broadcast.id)
          .maybeSingle();

        results.push({
          id: broadcast.id,
          name: broadcast.name,
          status: updatedBc?.status ?? 'sent',
          sent_count: updatedBc?.sent_count ?? 0,
          failed_count: updatedBc?.failed_count ?? 0,
        });
      } catch (bcErr: any) {
        console.error(`[process-scheduled] Error processing broadcast ${broadcast.id}:`, bcErr);
        await finalizeBroadcastStatus(adminDb, broadcast.id).catch(() => {});
        results.push({
          id: broadcast.id,
          name: broadcast.name,
          status: 'error',
          error: bcErr?.message || 'Broadcast processing failed',
        });
      } finally {
        await releaseBroadcastDelivery(adminDb, broadcast.id);
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      broadcasts: results,
    });
  } catch (err: any) {
    console.error('[process-scheduled] Fatal error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
