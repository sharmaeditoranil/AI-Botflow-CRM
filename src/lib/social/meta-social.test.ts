import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  sendFacebookMessage,
  sendInstagramMessage,
  getFacebookUserProfile,
  getInstagramUserProfile,
  exchangeCodeForUserToken,
  fetchUserFacebookPages,
  subscribePageToApp,
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

  describe('OAuth helpers', () => {
    it('exchangeCodeForUserToken handles valid response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'user-token-123' }),
      } as Response);

      const res = await exchangeCodeForUserToken('code-123', 'app-id', 'app-secret', 'http://localhost/callback');
      expect(res).toEqual({ userAccessToken: 'user-token-123' });
    });

    it('fetchUserFacebookPages returns pages array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'page-1',
              name: 'My Brand',
              access_token: 'page-token-1',
              instagram_business_account: { id: 'ig-1', username: 'mybrand' },
            },
          ],
        }),
      } as Response);

      const res = await fetchUserFacebookPages('user-token-123');
      expect('pages' in res).toBe(true);
      if ('pages' in res) {
        expect(res.pages[0].id).toBe('page-1');
        expect(res.pages[0].instagram_business_account?.username).toBe('mybrand');
      }
    });

    it('subscribePageToApp returns success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const res = await subscribePageToApp('page-1', 'token-1');
      expect(res.success).toBe(true);
    });
  });
});
