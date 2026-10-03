import { NextRequest, NextResponse } from 'next/server';
import { assertSuperAdmin, logSuperAdminAction } from '@/lib/auth/super-admin';
import {
  getStorageRetentionSettings,
  saveStorageRetentionSettings,
  executeStorageCleanup,
} from '@/lib/storage/storage-cleanup';

export async function GET() {
  try {
    await assertSuperAdmin();
    const settings = await getStorageRetentionSettings();

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await assertSuperAdmin();
    const body = await req.json().catch(() => ({}));

    if (body.action === 'run_now') {
      const stats = await executeStorageCleanup({
        manual: true,
        adminUserId: admin.userId,
      });

      return NextResponse.json({
        success: true,
        stats,
        message: stats.summary,
      });
    }

    // Otherwise, save policy configuration
    const updates: any = {};
    if ('auto_cleanup_enabled' in body) {
      updates.auto_cleanup_enabled = Boolean(body.auto_cleanup_enabled);
    }
    if ('retention_media_days' in body) {
      updates.retention_media_days = Math.max(1, Number(body.retention_media_days) || 30);
    }
    if ('retention_logs_days' in body) {
      updates.retention_logs_days = Math.max(1, Number(body.retention_logs_days) || 30);
    }
    if ('retention_messages_days' in body) {
      updates.retention_messages_days = Math.max(0, Number(body.retention_messages_days) || 0);
    }
    if ('clean_storage_files' in body) {
      updates.clean_storage_files = Boolean(body.clean_storage_files);
    }
    if ('clean_automation_logs' in body) {
      updates.clean_automation_logs = Boolean(body.clean_automation_logs);
    }
    if ('clean_inactive_runs' in body) {
      updates.clean_inactive_runs = Boolean(body.clean_inactive_runs);
    }

    const saved = await saveStorageRetentionSettings(updates);

    await logSuperAdminAction({
      actorUserId: admin.userId,
      action: 'update_storage_retention_policy',
      targetType: 'storage_retention',
      targetId: 'default',
      details: updates,
    });

    return NextResponse.json({
      success: true,
      settings: saved,
      message: 'Storage retention policy saved successfully.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
