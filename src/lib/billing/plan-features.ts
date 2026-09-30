import { createClient as createAdminClient } from '@supabase/supabase-js';

export interface PlanFeaturesConfig {
  whatsapp_enabled: boolean;
  instagram_fb_enabled: boolean;
  gmb_magic_qr: boolean;
  gmb_ai_suite: boolean;
  ai_agents_enabled: boolean;
  automations_enabled: boolean;
  webhooks_api_enabled: boolean;
  support_level: string;
  gmb_locations_limit: number;
}

export const DEFAULT_PLAN_FEATURES: Record<string, PlanFeaturesConfig> = {
  trial: {
    whatsapp_enabled: true,
    instagram_fb_enabled: false,
    gmb_magic_qr: true,
    gmb_ai_suite: false,
    ai_agents_enabled: false,
    automations_enabled: true,
    webhooks_api_enabled: false,
    support_level: 'Community & Docs',
    gmb_locations_limit: 1,
  },
  starter: {
    whatsapp_enabled: true,
    instagram_fb_enabled: false,
    gmb_magic_qr: true,
    gmb_ai_suite: false,
    ai_agents_enabled: false,
    automations_enabled: true,
    webhooks_api_enabled: false,
    support_level: 'Standard WhatsApp Support',
    gmb_locations_limit: 1,
  },
  growth: {
    whatsapp_enabled: true,
    instagram_fb_enabled: true,
    gmb_magic_qr: true,
    gmb_ai_suite: true,
    ai_agents_enabled: true,
    automations_enabled: true,
    webhooks_api_enabled: true,
    support_level: 'Priority WhatsApp & Email Support',
    gmb_locations_limit: 3,
  },
  enterprise: {
    whatsapp_enabled: true,
    instagram_fb_enabled: true,
    gmb_magic_qr: true,
    gmb_ai_suite: true,
    ai_agents_enabled: true,
    automations_enabled: true,
    webhooks_api_enabled: true,
    support_level: '24/7 Dedicated Account Manager & REST API',
    gmb_locations_limit: 10,
  },
};

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Fetch all plan features from platform_settings storage.
 */
export async function getPlanFeaturesConfig(): Promise<Record<string, PlanFeaturesConfig>> {
  try {
    const supabase = getAdminSupabase();
    const { data: setting } = await supabase
      .from('platform_settings')
      .select('stripe_webhook_secret')
      .eq('id', 'default')
      .single();

    if (!setting?.stripe_webhook_secret) {
      return DEFAULT_PLAN_FEATURES;
    }

    const parsed = JSON.parse(setting.stripe_webhook_secret);
    return {
      trial: { ...DEFAULT_PLAN_FEATURES.trial, ...(parsed.trial || {}) },
      starter: { ...DEFAULT_PLAN_FEATURES.starter, ...(parsed.starter || {}) },
      growth: { ...DEFAULT_PLAN_FEATURES.growth, ...(parsed.growth || {}) },
      enterprise: { ...DEFAULT_PLAN_FEATURES.enterprise, ...(parsed.enterprise || {}) },
    };
  } catch {
    return DEFAULT_PLAN_FEATURES;
  }
}

/**
 * Save updated plan features config into platform_settings storage.
 */
export async function savePlanFeaturesConfig(
  config: Record<string, Partial<PlanFeaturesConfig>>
): Promise<boolean> {
  try {
    const current = await getPlanFeaturesConfig();
    const merged: Record<string, PlanFeaturesConfig> = {
      trial: { ...current.trial, ...(config.trial || {}) },
      starter: { ...current.starter, ...(config.starter || {}) },
      growth: { ...current.growth, ...(config.growth || {}) },
      enterprise: { ...current.enterprise, ...(config.enterprise || {}) },
    };

    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from('platform_settings')
      .update({ stripe_webhook_secret: JSON.stringify(merged) })
      .eq('id', 'default');

    return !error;
  } catch {
    return false;
  }
}
