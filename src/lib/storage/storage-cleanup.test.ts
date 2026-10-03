import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DEFAULT_RETENTION_SETTINGS,
  getStorageRetentionSettings,
  saveStorageRetentionSettings,
  executeStorageCleanup,
} from './storage-cleanup';

vi.mock('@/lib/auth/super-admin', () => {
  return {
    getAdminSupabase: vi.fn(),
    logSuperAdminAction: vi.fn().mockResolvedValue(undefined),
  };
});

import { getAdminSupabase } from '@/lib/auth/super-admin';

describe('storage-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_RETENTION_SETTINGS', () => {
    it('has safe default retention policies', () => {
      expect(DEFAULT_RETENTION_SETTINGS.auto_cleanup_enabled).toBe(true);
      expect(DEFAULT_RETENTION_SETTINGS.retention_media_days).toBe(30);
      expect(DEFAULT_RETENTION_SETTINGS.retention_logs_days).toBe(30);
      expect(DEFAULT_RETENTION_SETTINGS.retention_messages_days).toBe(0);
      expect(DEFAULT_RETENTION_SETTINGS.clean_storage_files).toBe(true);
      expect(DEFAULT_RETENTION_SETTINGS.clean_automation_logs).toBe(true);
    });
  });

  describe('getStorageRetentionSettings', () => {
    it('returns default settings when database has no stored settings', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      };
      (getAdminSupabase as any).mockReturnValue(mockSupabase);

      const settings = await getStorageRetentionSettings();
      expect(settings).toEqual(DEFAULT_RETENTION_SETTINGS);
    });

    it('parses stored JSON retention config correctly', async () => {
      const customConfig = {
        auto_cleanup_enabled: true,
        retention_media_days: 15,
        retention_logs_days: 7,
        retention_messages_days: 60,
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { stripe_publishable_key: JSON.stringify(customConfig) },
                error: null,
              }),
            }),
          }),
        }),
      };
      (getAdminSupabase as any).mockReturnValue(mockSupabase);

      const settings = await getStorageRetentionSettings();
      expect(settings.retention_media_days).toBe(15);
      expect(settings.retention_logs_days).toBe(7);
      expect(settings.retention_messages_days).toBe(60);
      expect(settings.clean_storage_files).toBe(true);
    });
  });

  describe('saveStorageRetentionSettings', () => {
    it('merges updates with existing settings and writes to platform_settings', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'platform_settings') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { stripe_publishable_key: JSON.stringify({ retention_media_days: 30 }) },
                    error: null,
                  }),
                }),
              }),
              update: updateMock,
            };
          }
          return {};
        }),
      };
      (getAdminSupabase as any).mockReturnValue(mockSupabase);

      const updated = await saveStorageRetentionSettings({ retention_media_days: 60 });
      expect(updated.retention_media_days).toBe(60);
      expect(updateMock).toHaveBeenCalled();
    });
  });

  describe('executeStorageCleanup', () => {
    it('skips cleanup if auto_cleanup_enabled is false and execution is non-manual', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { stripe_publishable_key: JSON.stringify({ auto_cleanup_enabled: false }) },
                error: null,
              }),
            }),
          }),
        }),
      };
      (getAdminSupabase as any).mockReturnValue(mockSupabase);

      const stats = await executeStorageCleanup({ manual: false });
      expect(stats.files_deleted).toBe(0);
      expect(stats.log_rows_deleted).toBe(0);
      expect(stats.summary).toContain('skipped');
    });

    it('executes cleanup when triggered manually even if auto_cleanup is false', async () => {
      const deleteMock = vi.fn().mockReturnValue({
        lt: vi.fn().mockResolvedValue({ count: 5, error: null }),
        in: vi.fn().mockReturnValue({
          lt: vi.fn().mockResolvedValue({ count: 2, error: null }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockStorage = {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'platform_settings') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      stripe_publishable_key: JSON.stringify({
                        auto_cleanup_enabled: false,
                        retention_media_days: 15,
                        retention_logs_days: 15,
                      }),
                    },
                    error: null,
                  }),
                }),
              }),
              update: updateMock,
            };
          }
          return {
            delete: deleteMock,
          };
        }),
        storage: mockStorage,
      };
      (getAdminSupabase as any).mockReturnValue(mockSupabase);

      const stats = await executeStorageCleanup({ manual: true, adminUserId: 'admin-123' });
      expect(stats.status).toBe('success');
      expect(stats.summary).toContain('Cleaned');
    });
  });
});
