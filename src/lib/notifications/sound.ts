/**
 * Web Audio API based notification sound player.
 * Generates a clean, pleasant, WhatsApp-style incoming message chime
 * without requiring any external mp3 asset downloads.
 */

import { useSyncExternalStore } from 'react';

export const NOTIFICATION_SOUND_STORAGE_KEY = 'wacrm:notification-sound';
export const NOTIFICATION_SOUND_CHANGE_EVENT = 'wacrm:notification-sound-change';

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined' || !('localStorage' in window)) return true;
  try {
    // Sound is enabled by default unless user explicitly sets "0"
    return window.localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    if (enabled) {
      window.localStorage.removeItem(NOTIFICATION_SOUND_STORAGE_KEY);
    } else {
      window.localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, '0');
    }
  } catch {
    // Ignore localStorage errors in private browsing / sandboxes
  }
  window.dispatchEvent(new Event(NOTIFICATION_SOUND_CHANGE_EVENT));
}

export function subscribeNotificationSoundPref(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === NOTIFICATION_SOUND_STORAGE_KEY) onChange();
  };
  window.addEventListener(NOTIFICATION_SOUND_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(NOTIFICATION_SOUND_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useNotificationSoundPref(): boolean {
  return useSyncExternalStore(
    subscribeNotificationSoundPref,
    isNotificationSoundEnabled,
    () => true,
  );
}

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

// Automatically unlock the AudioContext on the first user interaction (click, keydown, tap)
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore
    }
  };
  window.addEventListener('click', unlockAudio, { passive: true, once: true });
  window.addEventListener('keydown', unlockAudio, { passive: true, once: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
}

/**
 * Plays a pleasant 2-tone chime (WhatsApp/Slack-like friendly ring) for incoming messages.
 */
export function playNotificationSound(): void {
  if (!isNotificationSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5) - bright bell attack
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2: 880 Hz (A5) - starts 100ms later for melodious notification chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.3, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn('[NotificationSound] Could not play sound:', err);
  }
}
