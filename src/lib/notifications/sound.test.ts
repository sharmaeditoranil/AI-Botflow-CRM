import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATION_SOUND_STORAGE_KEY,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  playNotificationSound,
} from './sound';

describe('notification sound module', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports sound enabled by default during SSR and in browser', () => {
    expect(isNotificationSoundEnabled()).toBe(true);
  });

  it('reads and writes sound preference to localStorage', () => {
    const store = new Map<string, string>();
    const events: string[] = [];

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      dispatchEvent: (e: { type: string }) => {
        events.push(e.type);
        return true;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('Event', class { constructor(public type: string) {} });

    expect(isNotificationSoundEnabled()).toBe(true);

    setNotificationSoundEnabled(false);
    expect(store.get(NOTIFICATION_SOUND_STORAGE_KEY)).toBe('0');
    expect(isNotificationSoundEnabled()).toBe(false);

    setNotificationSoundEnabled(true);
    expect(store.has(NOTIFICATION_SOUND_STORAGE_KEY)).toBe(false);
    expect(isNotificationSoundEnabled()).toBe(true);

    expect(events.length).toBe(2);
  });

  it('safely handles playNotificationSound when audio context is unavailable', () => {
    expect(() => playNotificationSound()).not.toThrow();
  });
});
