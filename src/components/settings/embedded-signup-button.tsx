'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Loader2,
  AlertCircle,
  Smartphone,
  Cloud,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface EmbeddedSignupButtonProps {
  onConnected?: () => void;
}

type SignupMode = 'coexistence' | 'standard';

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: {
          authResponse?: {
            code?: string;
            accessToken?: string;
            userID?: string;
          };
          status?: string;
          error?: unknown;
        }) => void,
        options: Record<string, unknown>
      ) => void;
    };
  }
}

export function EmbeddedSignupButton({ onConnected }: EmbeddedSignupButtonProps) {
  const { user, accountId } = useAuth();
  const [loadingMode, setLoadingMode] = useState<SignupMode | null>(null);
  const [selectedMode, setSelectedMode] = useState<SignupMode>('coexistence');
  const [config, setConfig] = useState<{
    appId: string | null;
    configId: string | null;
    isConfigured: boolean;
  }>({
    appId: null,
    configId: null,
    isConfigured: false,
  });
  const [sdkReady, setSdkReady] = useState(false);

  // Stored asset IDs received from postMessage during Embedded Signup
  const sessionDataRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  // Listen for success or error in query params (from OAuth redirect callback)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === 'true') {
        const phone = params.get('phone');
        const isCoex = params.get('coex') === 'true';
        if (isCoex) {
          toast.success(
            phone
              ? `WhatsApp Connected in Coexistence Mode (${phone})! Mobile App aur CRM Panel dono active hain.`
              : 'WhatsApp Connected in Coexistence Mode! Mobile App aur CRM Panel dono active hain.'
          );
        } else {
          toast.success(phone ? `WhatsApp Connected successfully (${phone})!` : 'WhatsApp Connected successfully!');
        }
        onConnected?.();
        window.history.replaceState({}, document.title, window.location.pathname + '?tab=whatsapp');
      } else if (params.get('error')) {
        toast.error(`WhatsApp connection failed: ${decodeURIComponent(params.get('error')!)}`);
        window.history.replaceState({}, document.title, window.location.pathname + '?tab=whatsapp');
      }
    }
  }, [onConnected]);

  // Fetch public Meta App ID and Config ID
  useEffect(() => {
    fetch('/api/whatsapp/embedded-signup')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.appId) {
          setConfig(data);
        }
      })
      .catch((err) => console.error('[EmbeddedSignup] Config fetch error:', err));
  }, []);

  // Initialize Facebook JavaScript SDK for Embedded Signup popup flow
  useEffect(() => {
    if (typeof window === 'undefined' || !config.appId) return;

    // Load Meta JS SDK if not already in document
    const initSdk = () => {
      if (window.FB) {
        try {
          window.FB.init({
            appId: config.appId,
            cookie: true,
            xfbml: true,
            version: 'v21.0',
          });
          setSdkReady(true);
        } catch (err) {
          console.warn('[EmbeddedSignup] FB.init error:', err);
        }
      }
    };

    if (window.FB) {
      initSdk();
    } else {
      window.fbAsyncInit = () => {
        initSdk();
      };
      const existingScript = document.getElementById('facebook-jssdk');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        document.body.appendChild(script);
      }
    }

    // Capture asset IDs emitted by Meta's Embedded Signup popup via window postMessage
    const handlePostMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return;
      }
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.type === 'WA_EMBEDDED_SIGNUP') {
          if (payload.event === 'FINISH') {
            const { phone_number_id, waba_id } = payload.data || {};
            sessionDataRef.current = {
              phoneNumberId: phone_number_id,
              wabaId: waba_id,
            };
            console.log('[EmbeddedSignup] Session info captured:', sessionDataRef.current);
          }
        }
      } catch {
        // Ignore unparseable post messages
      }
    };

    window.addEventListener('message', handlePostMessage);
    return () => {
      window.removeEventListener('message', handlePostMessage);
    };
  }, [config.appId]);

  // Exchange auth code with backend
  const exchangeCode = async (
    code: string,
    wabaId?: string,
    phoneNumberId?: string,
    isCoexistence?: boolean
  ) => {
    try {
      const res = await fetch('/api/whatsapp/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          wabaId,
          phoneNumberId,
          coexistence: isCoexistence,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to complete WhatsApp connection with Meta.');
      } else {
        toast.success(
          isCoexistence
            ? `WhatsApp Connected in Coexistence Mode (${data.displayPhoneNumber || ''})! Mobile App aur CRM Panel dono active hain.`
            : `WhatsApp Connected (${data.displayPhoneNumber || ''}) successfully!`
        );
        onConnected?.();
      }
    } catch (err: any) {
      console.error('[EmbeddedSignup] Exchange error:', err);
      toast.error('Network error saving WhatsApp configuration.');
    } finally {
      setLoadingMode(null);
    }
  };

  // Launch Embedded Signup flow via direct OAuth redirect
  const handleLaunchSignup = (mode: SignupMode) => {
    if (!config.isConfigured || !config.appId || !config.configId) {
      toast.error('Meta App ID and Config ID are not configured yet. Super-Admin must configure them in settings.');
      return;
    }

    setLoadingMode(mode);

    const isCoex = mode === 'coexistence';
    const extras = isCoex
      ? {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
          coex: true,
        }
      : {
          setup: {},
          sessionInfoVersion: '3',
        };

    const redirectUri = `${window.location.origin}/api/whatsapp/embedded-signup/callback`;
    const state = `${accountId || ''}:${user?.id || ''}:${isCoex ? 'coex' : 'std'}`;

    // Direct OAuth redirect flow: seamlessly navigates to Meta without popups getting
    // blocked or stranded at "dialog/close_window" (Please close this tab). Meta will
    // redirect directly back to our server callback with the auth code.
    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${config.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${config.configId}&response_type=code&state=${encodeURIComponent(state)}&extras=${encodeURIComponent(JSON.stringify(extras))}`;
    window.location.href = oauthUrl;
  };

  return (
    <div className="rounded-2xl border border-primary/25 bg-card/60 backdrop-blur-sm p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-5 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1877F2]/10 text-[#1877F2]">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="text-base font-semibold text-foreground">
              Connect WhatsApp via Meta Embedded Signup
            </h3>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-xs font-medium text-emerald-500">
              Official Meta Integration
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Apne WhatsApp Business Account ko 1-click me connect karein bina kisi manual API token ya phone ID copy kiye.
          </p>
        </div>
      </div>

      {/* Two Mode Options */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {/* Mode 1: Existing WhatsApp Business App (Coexistence) */}
        <div
          onClick={() => setSelectedMode('coexistence')}
          className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
            selectedMode === 'coexistence'
              ? 'border-emerald-500/80 bg-emerald-500/5 ring-1 ring-emerald-500/50 shadow-sm'
              : 'border-border/70 bg-card/40 hover:border-border hover:bg-muted/30'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  selectedMode === 'coexistence'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Existing WhatsApp Business App
                </h4>
                <span className="text-[11px] font-medium text-emerald-500">
                  Coexistence Mode (Recommended)
                </span>
              </div>
            </div>
            {selectedMode === 'coexistence' && (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            )}
          </div>

          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground/90">
              ⚡ WhatsApp Business App + CRM Panel Dono Chale
            </p>
            <ul className="space-y-1 text-[11px] leading-relaxed">
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                Mobile phone se WhatsApp Business app delete nahi hoga.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                Phone se bheje gaye messages bhi CRM panel me turant sync honge.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                Purana chat history aur contacts safe rahenge.
              </li>
            </ul>
          </div>
        </div>

        {/* Mode 2: Standard WhatsApp Cloud API */}
        <div
          onClick={() => setSelectedMode('standard')}
          className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
            selectedMode === 'standard'
              ? 'border-blue-500/80 bg-blue-500/5 ring-1 ring-blue-500/50 shadow-sm'
              : 'border-border/70 bg-card/40 hover:border-border hover:bg-muted/30'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  selectedMode === 'standard'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  New or Dedicated Cloud API Number
                </h4>
                <span className="text-[11px] font-medium text-blue-500">
                  Standard Cloud API
                </span>
              </div>
            </div>
            {selectedMode === 'standard' && (
              <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
            )}
          </div>

          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground/90">
              ⚡ Naye ya Standalone Number ke Liye
            </p>
            <ul className="space-y-1 text-[11px] leading-relaxed">
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                Naye mobile number ko seedhe WhatsApp Cloud API par register karein.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                High-volume automated marketing, bots aur broadcasts ke liye ideal.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                Mobile app coexistence ki zaroorat nahi hai.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Mode Details & Quick Instructions */}
      {selectedMode === 'coexistence' && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-emerald-600 dark:text-emerald-400">
                Coexistence Setup Kaise Kaam Karta Hai:
              </p>
              <p className="leading-relaxed">
                Jab aap Meta popup me apna existing WhatsApp Business number daalenge, Meta aapke phone me WhatsApp Business app par ek 6-digit code bhejega. Us code ko Meta screen me enter karte hi aapka phone aur CRM panel dono active ho jayenge!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action CTA Button */}
      <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-border/40">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>Meta Verified Cloud API Integration · End-to-End Encrypted</span>
        </div>

        <Button
          type="button"
          onClick={() => handleLaunchSignup(selectedMode)}
          disabled={loadingMode !== null}
          size="lg"
          className={`shrink-0 text-white font-medium shadow-md transition-all ${
            selectedMode === 'coexistence'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-[#1877F2] hover:bg-[#166fe5]'
          }`}
        >
          {loadingMode !== null ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Meta se Connect ho raha hai...
            </>
          ) : (
            <>
              <svg className="mr-2 h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {selectedMode === 'coexistence'
                ? 'Connect Existing Business App (Coexistence)'
                : 'Connect Standard Cloud API'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      {!config.isConfigured && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Meta App configuration is pending. Super-Admin must configure Meta App ID & Config ID in Platform Settings, or you can use manual setup below.</span>
        </div>
      )}
    </div>
  );
}
