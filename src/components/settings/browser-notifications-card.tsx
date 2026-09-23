'use client';

import { useState, useSyncExternalStore } from 'react';
import { Bell, BellRing, CircleAlert, Loader2, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useBrowserNotifyPref } from '@/hooks/use-browser-notifications';
import {
  BROWSER_NOTIFY_CHANGE_EVENT,
  getNotificationPermission,
  writeBrowserNotifyPref,
  type BrowserNotifyPermission,
} from '@/lib/notifications/browser-notify';
import {
  playNotificationSound,
  setNotificationSoundEnabled,
  useNotificationSoundPref,
} from '@/lib/notifications/sound';

// `Notification.permission` has no change event of its own. Re-read it
// whenever the tab regains focus (the user may have flipped the site
// setting in the browser UI) and whenever our own preference changes
// (right after requestPermission resolves).
function subscribePermission(onChange: () => void): () => void {
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener(BROWSER_NOTIFY_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener(BROWSER_NOTIFY_CHANGE_EVENT, onChange);
  };
}

const serverPermission = (): BrowserNotifyPermission => 'unsupported';

/**
 * "Browser notifications" card — device-scoped opt-in for desktop
 * alerts and sound chimes about new customer messages.
 */
export function BrowserNotificationsCard({ className }: { className?: string }) {
  const t = useTranslations('Settings.browserNotifications');
  const enabled = useBrowserNotifyPref();
  const soundEnabled = useNotificationSoundPref();
  const permission = useSyncExternalStore(
    subscribePermission,
    getNotificationPermission,
    serverPermission,
  );
  const [requesting, setRequesting] = useState(false);

  const supported = permission !== 'unsupported';
  const checked = enabled && permission === 'granted';

  const onToggle = async (next: boolean) => {
    if (!next) {
      writeBrowserNotifyPref(false);
      return;
    }
    if (permission === 'granted') {
      writeBrowserNotifyPref(true);
      return;
    }
    if (permission === 'denied') {
      toast.error(t('statusDenied'), { description: t('deniedHint') });
      return;
    }
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      // Also dispatches the change event, which refreshes `permission`.
      writeBrowserNotifyPref(result === 'granted');
      if (result === 'denied') {
        toast.error(t('permissionDeniedToast'), { description: t('deniedHint') });
      }
    } finally {
      setRequesting(false);
    }
  };

  const sendTest = () => {
    try {
      new Notification(t('testTitle'), {
        body: t('testBody'),
        icon: '/icon',
        tag: 'wacrm-test-notification',
      });
    } catch {
      toast.error(t('unsupported'));
    }
  };

  const statusKey =
    permission === 'granted'
      ? 'statusGranted'
      : permission === 'denied'
        ? 'statusDenied'
        : 'statusDefault';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Bell className="size-4 text-muted-foreground" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sound Notification Alert Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t('soundToggleLabel')}
              </p>
              <p className="text-xs text-muted-foreground">{t('soundToggleDesc')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                checked={soundEnabled}
                onCheckedChange={(next) => setNotificationSoundEnabled(next)}
                aria-label={t('soundToggleLabel')}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => playNotificationSound()}
          >
            <Volume2 className="size-4" />
            {t('testSound')}
          </Button>
        </div>

        {/* Desktop Notification Popup Section */}
        <div className="space-y-3 pt-2 border-t border-border">
          {!supported ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleAlert className="size-4 shrink-0" />
              {t('unsupported')}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t('toggleLabel')}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('toggleDesc')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {requesting && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    checked={checked}
                    onCheckedChange={(next) => void onToggle(next)}
                    disabled={requesting || permission === 'denied'}
                    aria-label={t('toggleLabel')}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t(statusKey)}</p>

              {permission === 'denied' && (
                <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t('deniedHint')}</span>
                </p>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={sendTest}
                disabled={!checked}
              >
                <BellRing className="size-4" />
                {t('sendTest')}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
