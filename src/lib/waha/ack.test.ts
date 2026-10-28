import { describe, it, expect, vi } from 'vitest';
import {
  extractWahaMessageId,
  mapWahaAckToStatus,
  WAHA_STATUS_PRIORITY,
  findMessageByWahaId,
} from './client';

describe('WAHA Message ACK & Status Handling', () => {
  describe('extractWahaMessageId', () => {
    it('extracts direct string ID', () => {
      expect(extractWahaMessageId('true_919939967431@c.us_3EB023F48C6')).toBe(
        'true_919939967431@c.us_3EB023F48C6'
      );
    });

    it('extracts from root id string', () => {
      expect(extractWahaMessageId({ id: 'true_919939967431@c.us_3EB023F48C6' })).toBe(
        'true_919939967431@c.us_3EB023F48C6'
      );
    });

    it('extracts from WEBJS nested _serialized structure', () => {
      const payload = {
        id: {
          fromMe: true,
          remote: '919939967431@c.us',
          id: '3EB023F48C6',
          _serialized: 'true_919939967431@c.us_3EB023F48C6',
        },
      };
      expect(extractWahaMessageId(payload)).toBe('true_919939967431@c.us_3EB023F48C6');
    });

    it('extracts from Baileys / NOWEB key structure', () => {
      const payload = {
        key: {
          remoteJid: '919939967431@c.us',
          fromMe: true,
          id: '3EB023F48C6',
        },
      };
      expect(extractWahaMessageId(payload)).toBe('3EB023F48C6');
    });

    it('extracts from _data fallback structure', () => {
      const payload = {
        _data: {
          key: {
            id: '3EB023F48C6',
          },
        },
      };
      expect(extractWahaMessageId(payload)).toBe('3EB023F48C6');
    });

    it('returns null on null or empty input', () => {
      expect(extractWahaMessageId(null)).toBeNull();
      expect(extractWahaMessageId(undefined)).toBeNull();
      expect(extractWahaMessageId({})).toBeNull();
    });
  });

  describe('mapWahaAckToStatus', () => {
    it('maps ack: 1 or SERVER to sent (single tick)', () => {
      expect(mapWahaAckToStatus(1)).toBe('sent');
      expect(mapWahaAckToStatus(null, 'SERVER')).toBe('sent');
      expect(mapWahaAckToStatus('1', 'server')).toBe('sent');
    });

    it('maps ack: 2 or DEVICE to delivered (double check)', () => {
      expect(mapWahaAckToStatus(2)).toBe('delivered');
      expect(mapWahaAckToStatus(null, 'DEVICE')).toBe('delivered');
      expect(mapWahaAckToStatus('2', 'device')).toBe('delivered');
    });

    it('maps ack: 3 or READ to read (blue double check)', () => {
      expect(mapWahaAckToStatus(3)).toBe('read');
      expect(mapWahaAckToStatus(null, 'READ')).toBe('read');
      expect(mapWahaAckToStatus('3', 'read')).toBe('read');
    });

    it('maps ack: 4 or PLAYED to read (blue double check for voice/audio)', () => {
      expect(mapWahaAckToStatus(4)).toBe('read');
      expect(mapWahaAckToStatus(null, 'PLAYED')).toBe('read');
    });

    it('maps ack: -1 or ERROR to failed', () => {
      expect(mapWahaAckToStatus(-1)).toBe('failed');
      expect(mapWahaAckToStatus(null, 'ERROR')).toBe('failed');
      expect(mapWahaAckToStatus(null, 'FAILED')).toBe('failed');
    });

    it('maps ack: 0 or PENDING to sending (clock)', () => {
      expect(mapWahaAckToStatus(0)).toBe('sending');
      expect(mapWahaAckToStatus(null, 'PENDING')).toBe('sending');
    });

    it('returns null for unknown acks', () => {
      expect(mapWahaAckToStatus(99)).toBeNull();
      expect(mapWahaAckToStatus(null, 'UNKNOWN_STATUS')).toBeNull();
    });
  });

  describe('WAHA_STATUS_PRIORITY', () => {
    it('enforces unidirectional tick progression: sending < sent < delivered < read', () => {
      expect(WAHA_STATUS_PRIORITY.sending).toBeLessThan(WAHA_STATUS_PRIORITY.sent);
      expect(WAHA_STATUS_PRIORITY.sent).toBeLessThan(WAHA_STATUS_PRIORITY.delivered);
      expect(WAHA_STATUS_PRIORITY.delivered).toBeLessThan(WAHA_STATUS_PRIORITY.read);
    });

    it('prevents downgrade from read (blue tick) to delivered or sent', () => {
      const currentStatus = 'read';
      const incomingDelivered = 'delivered';
      const incomingSent = 'sent';

      expect(WAHA_STATUS_PRIORITY[incomingDelivered]).toBeLessThan(
        WAHA_STATUS_PRIORITY[currentStatus]
      );
      expect(WAHA_STATUS_PRIORITY[incomingSent]).toBeLessThan(
        WAHA_STATUS_PRIORITY[currentStatus]
      );
    });
  });

  describe('findMessageByWahaId', () => {
    it('matches exact message_id', async () => {
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'msg-1', message_id: '3EB023F48C6', status: 'sent' },
        }),
      };

      const result = await findMessageByWahaId(mockDb, '3EB023F48C6');
      expect(result).toBeDefined();
      expect(result?.id).toBe('msg-1');
      expect(mockDb.eq).toHaveBeenCalledWith('message_id', '3EB023F48C6');
    });

    it('resolves stanza ID from composite ID when stored as short ID', async () => {
      let callCount = 0;
      const mockDb = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          callCount++;
          return {
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              // First call (exact composite): not found
              // Second call (stanza ID): found!
              data: callCount === 2 ? { id: 'msg-2', message_id: val, status: 'sent' } : null,
            }),
          };
        }),
      };

      const result = await findMessageByWahaId(mockDb, 'true_919939967431@c.us_3EB023F48C6');
      expect(result).toBeDefined();
      expect(result?.id).toBe('msg-2');
      expect(result?.message_id).toBe('3EB023F48C6');
    });
  });
});
