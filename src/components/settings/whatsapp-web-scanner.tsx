'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  LogOut,
  Smartphone,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WhatsAppIcon } from '@/components/icons/social-icons';
import { cn } from '@/lib/utils';

interface SessionData {
  connected: boolean;
  sessionName: string | null;
  status: string | null;
  displayPhoneNumber: string | null;
  label: string | null;
  configId?: string;
  me?: {
    id: string;
    pushName?: string;
  } | null;
}

interface WhatsAppWebScannerProps {
  onNumberChanged?: () => void;
}

export function WhatsAppWebScanner({ onNumberChanged }: WhatsAppWebScannerProps) {
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());
  const [qrError, setQrError] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/waha/session', { cache: 'no-store' });
      if (!res.ok) return;
      const data: SessionData = await res.json();
      setSessionData(data);

      if (data.status === 'WORKING' || data.connected) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    } catch (err) {
      console.warn('[waha-scanner] checkStatus notice:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [checkStatus]);

  // Start polling when in QR mode
  const startPolling = useCallback((sessionName: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/waha/session', { cache: 'no-store' });
        if (!res.ok) return;
        const data: SessionData = await res.json();
        setSessionData(data);

        if (data.status === 'WORKING' || data.connected) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          toast.success('WhatsApp Web Connected Successfully!');
          onNumberChanged?.();
        }
      } catch (e) {
        // quiet
      }
    }, 2500);
  }, [onNumberChanged]);

  const handleStartSession = async () => {
    setInitiating(true);
    setQrError(false);
    try {
      const res = await fetch('/api/waha/session', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start session');

      setQrTimestamp(Date.now());
      await checkStatus();
      if (json.sessionName) {
        startPolling(json.sessionName);
      }
      toast.info('QR Code generated. Scan with your phone.');
    } catch (err: any) {
      toast.error(err.message || 'Error generating QR code');
    } finally {
      setInitiating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this WhatsApp Web session?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/waha/session', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect');

      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      await checkStatus();
      onNumberChanged?.();
      toast.success('WhatsApp Web disconnected');
    } catch (err: any) {
      toast.error(err.message || 'Error disconnecting');
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = sessionData?.connected || sessionData?.status === 'WORKING';
  const isScanning = !isConnected && (sessionData?.status === 'SCAN_QR_CODE' || sessionData?.status === 'STARTING');

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border overflow-hidden shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366]">
              <WhatsAppIcon className="size-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">WhatsApp Web (QR Scanner)</CardTitle>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Zap className="size-3" /> No 24h Window
                </span>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Connect via phone QR scanner. Ideal for unlimited AI follow-ups and conversational chat.
              </CardDescription>
            </div>
          </div>

          {isConnected && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 text-xs h-8"
              >
                {disconnecting ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <LogOut className="size-3.5 mr-1.5" />}
                Disconnect
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {isConnected ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {sessionData?.displayPhoneNumber || sessionData?.me?.id?.replace('@c.us', '') || 'WhatsApp Web Active'}
                  </p>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    ONLINE
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sessionData?.me?.pushName ? `Account Name: ${sessionData.me.pushName} • ` : ''}
                  Incoming messages appear in Inbox • AI follow-ups sent naturally with 0% template limits.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartSession}
                disabled={initiating}
                className="text-xs h-8"
                title="Refresh QR session connection"
              >
                <RefreshCw className={cn("size-3.5 mr-1.5", initiating && "animate-spin")} />
                Reconnect
              </Button>
            </div>
          </div>
        ) : isScanning && sessionData?.sessionName ? (
          <div className="grid gap-6 md:grid-cols-[220px_1fr] items-center">
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-white dark:bg-card shadow-inner">
              {qrError ? (
                <div className="flex flex-col items-center justify-center size-48 text-center p-4">
                  <AlertCircle className="size-8 text-amber-500 mb-2" />
                  <p className="text-xs text-muted-foreground mb-3">QR code expired or failed to load</p>
                  <Button size="sm" variant="outline" onClick={() => setQrTimestamp(Date.now())} className="text-xs">
                    <RefreshCw className="size-3.5 mr-1" /> Retry
                  </Button>
                </div>
              ) : (
                <div className="relative size-48 flex items-center justify-center bg-white p-2 rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/waha/qr?session=${encodeURIComponent(sessionData.sessionName)}&t=${qrTimestamp}`}
                    alt="Scan WhatsApp QR"
                    className="size-full object-contain"
                    onError={() => setQrError(true)}
                  />
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQrError(false);
                  setQrTimestamp(Date.now());
                }}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground h-7"
              >
                <RefreshCw className="size-3 mr-1" /> Reload QR Code
              </Button>
            </div>

            {/* Step-by-step instructions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Smartphone className="size-4 text-primary" />
                How to link your WhatsApp:
              </div>
              <ol className="space-y-2 text-xs text-muted-foreground pl-1">
                <li className="flex items-start gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                    1
                  </span>
                  <span>Open <strong>WhatsApp</strong> on your mobile phone.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                    2
                  </span>
                  <span>
                    Tap <strong>Menu (⋮)</strong> on Android or <strong>Settings (⚙️)</strong> on iPhone, then tap <strong>Linked Devices</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                    3
                  </span>
                  <span>Tap <strong>Link a Device</strong> and point your camera at this QR code.</span>
                </li>
              </ol>

              <div className="pt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-xs h-8 text-muted-foreground"
                >
                  Cancel
                </Button>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin text-primary" />
                  Waiting for phone scan...
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No WhatsApp Web number connected yet.
              </p>
              <p className="text-xs text-muted-foreground max-w-xl">
                Scan your QR code to link an additional WhatsApp number for direct 1-on-1 chatting and unlimited AI follow-ups without Meta 24-hour service restrictions.
              </p>
            </div>

            <Button
              onClick={handleStartSession}
              disabled={initiating}
              className="shrink-0 bg-[#25D366] hover:bg-[#20ba59] text-white font-medium"
            >
              {initiating ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Generating QR...
                </>
              ) : (
                <>
                  <QrCode className="size-4 mr-2" />
                  Scan WhatsApp Web QR
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
