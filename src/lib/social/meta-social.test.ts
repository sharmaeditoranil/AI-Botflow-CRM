import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  sendFacebookMessage,
  sendInstagramMessage,
  getFacebookUserProfile,
  getInstagramUserProfile,
} from './meta-social';

describe('Meta Social Messaging', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('sendFacebookMessage', () => {
    it('throws error when pageAccessToken is missing', async () => {
      await expect(
        sendFacebookMessage({
          pageAccessToken: '',
          recipientId: 'psid-123',
          text: 'Hello',
        })
      ).rejects.toThrow('Facebook Page Access Token is required');
    });

    it('throws error when recipientId is missing', async () => {
      await expect(
        sendFacebookMessage({
          pageAccessToken: 'token-abc',
          recipientId: '',
          text: 'Hello',
        })
      ).rejects.toThrow('Recipient Facebook user ID (PSID) is required');
    });

    it('throws error when both text and mediaUrl are missing', async () => {
      await expect(
        sendFacebookMessage({
          pageAccessToken: 'token-abc',
          recipientId: 'psid-123',
        })
      ).rejects.toThrow('Either text or mediaUrl is required');
    });

    it('sends text message successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recipient_id: 'psid-123',
          message_id: 'mid.fb.12345',
        }),
      } as Response);

      const result = await sendFacebookMessage({
        pageAccessToken: 'token-abc',
        recipientId: 'psid-123',
        text: 'Hello Facebook User',
      });

      expect(result.messageId).toBe('mid.fb.12345');
      expect(result.recipientId).toBe('psid-123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages?access_token=token-abc'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            recipient: { id: 'psid-123' },
            messaging_type: 'RESPONSE',
            message: { text: 'Hello Facebook User' },
          }),
        })
      );
    });

    it('explains 24-hour window error clearly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Message is outside the allowed window',
            code: 10,
            error_subcode: 2018001,
          },
        }),
      } as Response);

      await expect(
        sendFacebookMessage({
          pageAccessToken: 'token-abc',
          recipientId: 'psid-123',
          text: 'Hello',
        })
      ).rejects.toThrow(/24-hour messaging window rule/);
    });
  });

  describe('sendInstagramMessage', () => {
    it('sends text DM successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recipient_id: 'igsid-456',
          message_id: 'mid.ig.67890',
        }),
      } as Response);

      const result = await sendInstagramMessage({
        pageAccessToken: 'token-xyz',
        recipientId: 'igsid-456',
        text: 'Hello Instagram User',
      });

      expect(result.messageId).toBe('mid.ig.67890');
      expect(result.recipientId).toBe('igsid-456');
    });
  });

  describe('getFacebookUserProfile', () => {
    it('fetches full name and avatar', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          first_name: 'Jane',
          last_name: 'Doe',
          profile_pic: 'https://fbcdn.net/pic.jpg',
        }),
      } as Response);

      const profile = await getFacebookUserProfile('psid-123', 'token-123');
      expect(profile).toEqual({
        name: 'Jane Doe',
        avatarUrl: 'https://fbcdn.net/pic.jpg',
      });
    });
  });

  describe('getInstagramUserProfile', () => {
    it('fetches username and name', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: 'Jane Studio',
          username: 'janestudio',
          profile_pic: 'https://cdn.instagram.com/pic.jpg',
        }),
      } as Response);

      const profile = await getInstagramUserProfile('igsid-456', 'token-123');
      expect(profile).toEqual({
        name: 'Jane Studio',
        username: 'janestudio',
        avatarUrl: 'https://cdn.instagram.com/pic.jpg',
      });
    });
  });
});
