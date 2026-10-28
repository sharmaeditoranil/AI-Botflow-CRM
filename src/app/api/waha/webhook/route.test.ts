import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

// Mock dependencies
const mockUpdate = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockMaybeSingle = vi.fn();

let mockMessageRow: any = null;
let mockRecipientRow: any = null;

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      if (table === 'messages') {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEq.mockImplementation((col: string, val: string) => ({
              order: mockOrder.mockReturnValue({
                limit: mockLimit.mockReturnValue({
                  maybeSingle: mockMaybeSingle.mockImplementation(async () => ({
                    data: mockMessageRow,
                    error: null,
                  })),
                }),
              }),
            })),
          }),
          update: mockUpdate.mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'broadcast_recipients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockRecipientRow }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      };
    }),
  }),
}));

describe('WAHA Webhook Route - message.ack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageRow = {
      id: 'msg-uuid-1',
      conversation_id: 'conv-1',
      message_id: '3EB023F48C6',
      status: 'sent',
    };
    mockRecipientRow = null;
  });

  it('updates message status to delivered on ack: 2', async () => {
    const req = new Request('http://localhost:3000/api/waha/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'message.ack',
        session: 'web_session_123',
        payload: {
          id: 'true_919939967431@c.us_3EB023F48C6',
          fromMe: true,
          ack: 2,
          ackName: 'DEVICE',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.newStatus).toBe('delivered');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'delivered',
      })
    );
  });

  it('updates message status to read on ack: 3 (blue tick)', async () => {
    mockMessageRow.status = 'delivered';

    const req = new Request('http://localhost:3000/api/waha/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'message.ack',
        session: 'web_session_123',
        payload: {
          id: '3EB023F48C6',
          fromMe: true,
          ack: 3,
          ackName: 'READ',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.newStatus).toBe('read');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'read',
      })
    );
  });

  it('does not downgrade status if message is already read', async () => {
    mockMessageRow.status = 'read';

    const req = new Request('http://localhost:3000/api/waha/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'message.ack',
        session: 'web_session_123',
        payload: {
          id: '3EB023F48C6',
          fromMe: true,
          ack: 2,
          ackName: 'DEVICE',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('status_already_advanced');
    expect(data.current).toBe('read');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
