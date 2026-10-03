import { getAdminSupabase, logSuperAdminAction } from '@/lib/auth/super-admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StorageRetentionSettings {
  auto_cleanup_enabled: boolean;
  retention_media_days: number;       // Default: 30 days (Chat & Flow media files)
  retention_logs_days: number;        // Default: 30 days (Execution logs & webhook payloads)
  retention_messages_days: number;    // Default: 0 (0 = Keep Forever; or 30, 60, 90, 180, 365)
  clean_storage_files: boolean;       // Purge expired files from chat-media & flow-media
  clean_automation_logs: boolean;     // Purge webhook & automation execution logs
  clean_inactive_runs: boolean;       // Purge completed / stale flow run history
  last_cleanup_at: string | null;
  last_cleanup_stats: CleanupRunStats | null;
}

export interface CleanupRunStats {
  files_deleted: number;
  bytes_freed: number;
  log_rows_deleted: number;
  messages_deleted: number;
  executed_at: string;
  duration_ms: number;
  status: 'success' | 'partial' | 'error';
  summary: string;
  details?: {
    chatMediaFiles: number;
    flowMediaFiles: number;
    webhookLogs: number;
    automationLogs: number;
    flowEvents: number;
    flowRuns: number;
    aiLogs: number;
  };
}

export const DEFAULT_RETENTION_SETTINGS: StorageRetentionSettings = {
  auto_cleanup_enabled: true,
  retention_media_days: 30,
  retention_logs_days: 30,
  retention_messages_days: 0, // 0 = Keep forever
  clean_storage_files: true,
  clean_automation_logs: true,
  clean_inactive_runs: true,
  last_cleanup_at: null,
  last_cleanup_stats: null,
};

/**
 * Fetch current storage retention settings from platform_settings table.
 */
export async function getStorageRetentionSettings(): Promise<StorageRetentionSettings> {
  try {
    const supabase = getAdminSupabase();
    const { data: setting, error } = await supabase
      .from('platform_settings')
      .select('stripe_publishable_key')
      .eq('id', 'default')
      .maybeSingle();

    if (error || !setting?.stripe_publishable_key) {
      return DEFAULT_RETENTION_SETTINGS;
    }

    const parsed = JSON.parse(setting.stripe_publishable_key);
    return {
      auto_cleanup_enabled: parsed.auto_cleanup_enabled !== false,
      retention_media_days: Number(parsed.retention_media_days ?? 30),
      retention_logs_days: Number(parsed.retention_logs_days ?? 30),
      retention_messages_days: Number(parsed.retention_messages_days ?? 0),
      clean_storage_files: parsed.clean_storage_files !== false,
      clean_automation_logs: parsed.clean_automation_logs !== false,
      clean_inactive_runs: parsed.clean_inactive_runs !== false,
      last_cleanup_at: parsed.last_cleanup_at || null,
      last_cleanup_stats: parsed.last_cleanup_stats || null,
    };
  } catch (err) {
    console.error('[storage-cleanup] Failed to read retention settings:', err);
    return DEFAULT_RETENTION_SETTINGS;
  }
}

/**
 * Save updated storage retention settings to platform_settings table.
 */
export async function saveStorageRetentionSettings(
  updates: Partial<StorageRetentionSettings>
): Promise<StorageRetentionSettings> {
  const current = await getStorageRetentionSettings();
  const merged: StorageRetentionSettings = {
    ...current,
    ...updates,
  };

  const supabase = getAdminSupabase();
  const jsonStr = JSON.stringify(merged);

  await supabase
    .from('platform_settings')
    .update({ stripe_publishable_key: jsonStr })
    .eq('id', 'default');

  return merged;
}

/**
 * Helper to recursively list and collect expired file paths in a Supabase Storage bucket.
 */
async function collectExpiredBucketFiles(
  supabase: SupabaseClient,
  bucket: string,
  folderPrefix: string,
  cutoffMs: number,
  maxFiles = 1000
): Promise<{ paths: string[]; totalBytes: number }> {
  const expiredPaths: string[] = [];
  let totalBytes = 0;

  async function walk(prefix: string) {
    if (expiredPaths.length >= maxFiles) return;

    let offset = 0;
    const pageSize = 100;

    while (true) {
      const { data: items, error } = await supabase.storage
        .from(bucket)
        .list(prefix, {
          limit: pageSize,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error || !items || items.length === 0) break;

      for (const item of items) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

        // Check if item is a folder (folders in Supabase storage have null id, null metadata, or null created_at)
        const isFolder =
          !item.id ||
          item.metadata === null ||
          (item as any).is_folder ||
          item.created_at === null ||
          item.created_at === undefined;

        if (isFolder) {
          await walk(itemPath);
        } else {
          // File: evaluate creation age (item.created_at is authoritative from object storage)
          let fileTime = 0;
          if (item.created_at) {
            fileTime = new Date(item.created_at).getTime();
          } else {
            // Fallback: check timestamp prefix in filename: e.g. <timestamp>-filename.ext
            const match = item.name.match(/^(\d{10,13})-/);
            if (match) {
              const rawPrefix = match[1];
              const parsed = Number(rawPrefix.length === 10 ? rawPrefix + '000' : rawPrefix);
              if (!isNaN(parsed) && parsed > 0) {
                fileTime = parsed;
              }
            }
          }

          if (fileTime > 0 && fileTime < cutoffMs) {
            expiredPaths.push(itemPath);
            totalBytes += item.metadata?.size || 0;
          }
        }
      }

      if (items.length < pageSize) break;
      offset += pageSize;
      if (offset >= 2000) break; // Safeguard per folder
    }
  }

  await walk(folderPrefix);
  return { paths: expiredPaths, totalBytes };
}

/**
 * Execute storage cleanup based on configured retention policies.
 */
export async function executeStorageCleanup(options?: {
  manual?: boolean;
  overrideSettings?: Partial<StorageRetentionSettings>;
  adminUserId?: string;
}): Promise<CleanupRunStats> {
  const startTime = Date.now();
  const currentSettings = await getStorageRetentionSettings();
  const settings: StorageRetentionSettings = {
    ...currentSettings,
    ...(options?.overrideSettings || {}),
  };

  if (!options?.manual && !settings.auto_cleanup_enabled) {
    return {
      files_deleted: 0,
      bytes_freed: 0,
      log_rows_deleted: 0,
      messages_deleted: 0,
      executed_at: new Date().toISOString(),
      duration_ms: 0,
      status: 'success',
      summary: 'Auto cleanup skipped (disabled in admin settings).',
    };
  }

  const supabase = getAdminSupabase();

  const mediaCutoffMs = startTime - settings.retention_media_days * 24 * 60 * 60 * 1000;
  const logsCutoffIso = new Date(
    startTime - settings.retention_logs_days * 24 * 60 * 60 * 1000
  ).toISOString();
  const messagesCutoffIso =
    settings.retention_messages_days > 0
      ? new Date(startTime - settings.retention_messages_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

  let totalFilesDeleted = 0;
  let totalBytesFreed = 0;
  let totalLogsDeleted = 0;
  let totalMessagesDeleted = 0;

  const details = {
    chatMediaFiles: 0,
    flowMediaFiles: 0,
    webhookLogs: 0,
    automationLogs: 0,
    flowEvents: 0,
    flowRuns: 0,
    aiLogs: 0,
  };

  // 1. Purge expired storage files (chat-media & flow-media)
  if (settings.clean_storage_files) {
    const bucketsToClean = ['chat-media', 'flow-media'];

    for (const bucket of bucketsToClean) {
      try {
        const { paths, totalBytes } = await collectExpiredBucketFiles(
          supabase,
          bucket,
          '',
          mediaCutoffMs,
          1000
        );

        if (paths.length > 0) {
          // Remove files in chunks of 100
          for (let i = 0; i < paths.length; i += 100) {
            const chunk = paths.slice(i, i + 100);
            const { error: removeErr } = await supabase.storage.from(bucket).remove(chunk);
            if (!removeErr) {
              totalFilesDeleted += chunk.length;
              if (bucket === 'chat-media') details.chatMediaFiles += chunk.length;
              if (bucket === 'flow-media') details.flowMediaFiles += chunk.length;
            } else {
              console.warn(`[storage-cleanup] Partial remove error on bucket ${bucket}:`, removeErr);
            }
          }
          totalBytesFreed += totalBytes;
        }
      } catch (bucketErr) {
        console.warn(`[storage-cleanup] Failed cleaning bucket ${bucket}:`, bucketErr);
      }
    }
  }

  // 2. Purge database execution logs & webhook payloads
  if (settings.clean_automation_logs) {
    try {
      // a. webhook_trigger_logs
      const { count: webhookCount } = await supabase
        .from('webhook_trigger_logs')
        .delete({ count: 'exact' })
        .lt('created_at', logsCutoffIso);
      if (webhookCount) {
        totalLogsDeleted += webhookCount;
        details.webhookLogs += webhookCount;
      }
    } catch (e) {
      console.warn('[storage-cleanup] Error cleaning webhook_trigger_logs:', e);
    }

    try {
      // b. automation_logs
      const { count: autoCount } = await supabase
        .from('automation_logs')
        .delete({ count: 'exact' })
        .lt('created_at', logsCutoffIso);
      if (autoCount) {
        totalLogsDeleted += autoCount;
        details.automationLogs += autoCount;
      }
    } catch (e) {
      console.warn('[storage-cleanup] Error cleaning automation_logs:', e);
    }

    try {
      // c. ai_usage_log
      const { count: aiCount } = await supabase
        .from('ai_usage_log')
        .delete({ count: 'exact' })
        .lt('created_at', logsCutoffIso);
      if (aiCount) {
        totalLogsDeleted += aiCount;
        details.aiLogs += aiCount;
      }
    } catch (e) {
      console.warn('[storage-cleanup] Error cleaning ai_usage_log:', e);
    }
  }

  // 3. Purge finished / stale flow runs & events
  if (settings.clean_inactive_runs) {
    try {
      // a. flow_run_events first (foreign key dependency)
      const { count: eventCount } = await supabase
        .from('flow_run_events')
        .delete({ count: 'exact' })
        .lt('created_at', logsCutoffIso);
      if (eventCount) {
        totalLogsDeleted += eventCount;
        details.flowEvents += eventCount;
      }

      // b. flow_runs finished statuses (flow_runs uses started_at)
      const { count: runCount } = await supabase
        .from('flow_runs')
        .delete({ count: 'exact' })
        .in('status', ['completed', 'failed', 'timed_out', 'handed_off'])
        .lt('started_at', logsCutoffIso);
      if (runCount) {
        totalLogsDeleted += runCount;
        details.flowRuns += runCount;
      }
    } catch (e) {
      console.warn('[storage-cleanup] Error cleaning flow runs:', e);
    }
  }

  // 4. Purge old messages (Optional: only if retention_messages_days > 0)
  if (messagesCutoffIso) {
    try {
      const { count: msgCount } = await supabase
        .from('messages')
        .delete({ count: 'exact' })
        .lt('created_at', messagesCutoffIso);
      if (msgCount) {
        totalMessagesDeleted += msgCount;
      }
    } catch (e) {
      console.warn('[storage-cleanup] Error cleaning messages:', e);
    }
  }

  const durationMs = Date.now() - startTime;
  const mbFreed = (totalBytesFreed / (1024 * 1024)).toFixed(2);
  const summary = `Cleaned ${totalFilesDeleted} files (~${mbFreed} MB) and purged ${totalLogsDeleted} log records in ${durationMs}ms.`;

  const stats: CleanupRunStats = {
    files_deleted: totalFilesDeleted,
    bytes_freed: totalBytesFreed,
    log_rows_deleted: totalLogsDeleted,
    messages_deleted: totalMessagesDeleted,
    executed_at: new Date().toISOString(),
    duration_ms: durationMs,
    status: 'success',
    summary,
    details,
  };

  // Update last cleanup info in platform_settings
  await saveStorageRetentionSettings({
    last_cleanup_at: stats.executed_at,
    last_cleanup_stats: stats,
  });

  // Log action to audit_logs if performed by admin
  if (options?.adminUserId) {
    try {
      await logSuperAdminAction({
        actorUserId: options.adminUserId,
        action: 'storage_cleanup_executed',
        targetType: 'storage_retention',
        targetId: 'default',
        details: stats,
      });
    } catch (auditErr) {
      console.warn('[storage-cleanup] Audit log error:', auditErr);
    }
  }

  return stats;
}
