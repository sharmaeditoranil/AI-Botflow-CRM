'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface EmbeddedSignupButtonProps {
  onConnected?: () => void;
}

export function EmbeddedSignupButton({ onConnected }: EmbeddedSignupButtonProps) {
  const { user, accountId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<{ appId: string | null; configId: string | null; isConfigured: boolean }>({
    appId: null,
    configId: null,
    isConfigured: false,
  });

  // Listen for success or error in query params (from OAuth redirect callback)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === 'true') {
        const phone = params.get('phone');
        toast.success(phone ? `WhatsApp Connected successfully (${phone})!` : 'WhatsApp Connected successfully!');
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

  const handleConnectWithMeta = () => {
    if (!config.isConfigured || !config.appId || !config.configId) {
      toast.error('Meta App ID and Config ID are not configured yet. Super-Admin must configure them.');
      return;
    }

    setLoading(true);
    const redirectUri = `${window.location.origin}/api/whatsapp/embedded-signup/callback`;
    const state = `${accountId || ''}:${user?.id || ''}`;
    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${config.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${config.configId}&response_type=code&state=${encodeURIComponent(state)}`;
    window.location.href = oauthUrl;
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              Option 1: Connect with Meta (Recommended)
            </h3>
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              1-Click Setup
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your official WhatsApp Business Account instantly without manually copying tokens or IDs.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleConnectWithMeta}
          disabled={loading}
          className="shrink-0 bg-[#1877F2] text-white hover:bg-[#166fe5]"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <svg className="mr-2 h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Connect with Meta
            </>
          )}
        </Button>
      </div>

      {!config.isConfigured && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Meta App configuration is pending. Configure Meta App ID & Config ID in Super-Admin settings, or use manual setup below.</span>
        </div>
      )}
    </div>
  );
}
