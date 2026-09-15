'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  PlugZap,
  Users,
  FileText,
  Send,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: any;
  completed: boolean;
}

export function OnboardingChecklist() {
  const { accountId } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 'whatsapp',
      title: 'Connect WhatsApp Account',
      description: 'Connect your WhatsApp Business Account via Meta Embedded Signup or API.',
      href: '/settings?tab=whatsapp',
      icon: PlugZap,
      completed: false,
    },
    {
      id: 'contacts',
      title: 'Add your first Contact',
      description: 'Import contacts from CSV or create a new contact manually.',
      href: '/contacts',
      icon: Users,
      completed: false,
    },
    {
      id: 'templates',
      title: 'Create or Sync Message Templates',
      description: 'Set up WhatsApp approved message templates for campaigns.',
      href: '/settings?tab=templates',
      icon: FileText,
      completed: false,
    },
    {
      id: 'broadcast',
      title: 'Send a Broadcast or Message',
      description: 'Reach out to your leads and customers directly from Aibotflow.',
      href: '/broadcasts',
      icon: Send,
      completed: false,
    },
  ]);

  useEffect(() => {
    if (!accountId) return;

    // Check localStorage for dismissal
    const isDismissed = localStorage.getItem(`aibotflow_onboarding_dismissed_${accountId}`);
    if (isDismissed === 'true') {
      setDismissed(true);
      setLoading(false);
      return;
    }

    const checkProgress = async () => {
      try {
        const supabase = createClient();

        // 1. WhatsApp connected?
        const { data: waConfig } = await supabase
          .from('whatsapp_config')
          .select('status')
          .eq('account_id', accountId)
          .maybeSingle();

        const isWaConnected = waConfig?.status === 'connected';

        // 2. Any contacts?
        const { count: contactsCount } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId);

        // 3. Any templates?
        const { count: templatesCount } = await supabase
          .from('message_templates')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId);

        // 4. Any messages?
        const { count: messagesCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .limit(1);

        setSteps((prev) => [
          { ...prev[0], completed: !!isWaConnected },
          { ...prev[1], completed: (contactsCount || 0) > 0 },
          { ...prev[2], completed: (templatesCount || 0) > 0 },
          { ...prev[3], completed: (messagesCount || 0) > 0 },
        ]);
      } catch (err) {
        console.error('Error checking onboarding progress:', err);
      } finally {
        setLoading(false);
      }
    };

    checkProgress();
  }, [accountId]);

  const handleDismiss = () => {
    if (accountId) {
      localStorage.setItem(`aibotflow_onboarding_dismissed_${accountId}`, 'true');
    }
    setDismissed(true);
  };

  if (loading || dismissed) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  // If 100% completed, auto-hide
  if (completedCount === steps.length) return null;

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        title="Dismiss onboarding checklist"
      >
        <X className="h-4 w-4" />
      </button>

      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-foreground">
              Welcome to Aibotflow! Quick Setup Guide
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Complete these steps to start capturing leads and automating WhatsApp conversations. ({completedCount}/
              {steps.length} completed)
            </CardDescription>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Link
                key={step.id}
                href={step.href}
                className={`group flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                  step.completed
                    ? 'border-border/60 bg-muted/30 text-muted-foreground'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {step.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-semibold ${
                      step.completed ? 'line-through text-muted-foreground' : 'text-foreground group-hover:text-primary'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{step.description}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
