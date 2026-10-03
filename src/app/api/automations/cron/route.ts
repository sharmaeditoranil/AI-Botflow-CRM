import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { drainDuePendingExecutions } from '@/lib/automations/engine'

/**
 * Drain due `automation_pending_executions` rows.
 * Hit on a schedule (Vercel Cron / external pinger) or internally.
 * Supports:
 *   - Header `x-cron-secret` matching AUTOMATION_CRON_SECRET or CRON_SECRET
 *   - Header `Authorization: Bearer <token>` (standard Vercel Cron auth)
 *   - Query parameter `?secret=<token>` or `?key=<token>`
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET || process.env.CRON_SECRET

  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const url = new URL(request.url)
  const supplied =
    request.headers.get('x-cron-secret') ||
    bearerToken ||
    url.searchParams.get('secret') ||
    url.searchParams.get('key') ||
    ''

  if (expected) {
    const suppliedBuf = Buffer.from(supplied)
    const expectedBuf = Buffer.from(expected)
    if (
      suppliedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(suppliedBuf, expectedBuf)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.warn('[cron] AUTOMATION_CRON_SECRET not set; executing in open mode')
  }

  const { processed, errors } = await drainDuePendingExecutions()

  // Also sweep scheduled CRM AI follow-ups due today
  let crmFollowupsProcessed = 0
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const crmRes = await fetch(`${origin}/api/crm/ai-followup`, {
      method: 'POST',
      headers: {
        'x-cron-secret': supplied || expected || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }).catch(() => null)
    if (crmRes && crmRes.ok) {
      const crmData = await crmRes.json().catch(() => ({}))
      crmFollowupsProcessed = crmData.processed || 0
    }
  } catch (crmErr) {
    console.warn('[cron] CRM AI follow-up runner notice:', crmErr)
  }

  // Also sweep automated storage & data retention cleanup (once every 24 hours)
  let storageCleanupRun = null
  try {
    const { getStorageRetentionSettings, executeStorageCleanup } = await import('@/lib/storage/storage-cleanup')
    const retentionSettings = await getStorageRetentionSettings()
    if (retentionSettings.auto_cleanup_enabled) {
      const lastRunMs = retentionSettings.last_cleanup_at
        ? new Date(retentionSettings.last_cleanup_at).getTime()
        : 0
      const hoursSinceLast = (Date.now() - lastRunMs) / (1000 * 60 * 60)
      if (hoursSinceLast >= 24) {
        storageCleanupRun = await executeStorageCleanup({ manual: false })
      }
    }
  } catch (storageErr) {
    console.warn('[cron] Auto storage cleanup runner notice:', storageErr)
  }

  return NextResponse.json({
    processed,
    errors,
    crmFollowupsProcessed,
    storageCleanupRun,
  })
}

