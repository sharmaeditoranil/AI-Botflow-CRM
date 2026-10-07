-- Migration: 056_handle_new_user_trigger.sql
-- Description: Recreates public.handle_new_user() function and attaches on_auth_user_created trigger on auth.users

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_full_name TEXT;
  v_workspace_name TEXT;
  v_account_id UUID;
  v_trial_plan_id UUID;
  v_is_super BOOLEAN := FALSE;
BEGIN
  v_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );

  v_workspace_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'workspace_name', ''),
    NULLIF(v_full_name, ''),
    NEW.email,
    'My account'
  );

  -- Automatically grant super-admin to owner email
  IF NEW.email = 'sharmaeditoranil@gmail.com' THEN
    v_is_super := TRUE;
  END IF;

  -- Find default trial plan
  SELECT id INTO v_trial_plan_id FROM public.plans WHERE slug = 'trial' OR is_default_trial = TRUE LIMIT 1;

  INSERT INTO public.accounts (
    name,
    owner_user_id,
    plan_id,
    subscription_status,
    trial_ends_at
  )
  VALUES (
    v_workspace_name,
    NEW.id,
    v_trial_plan_id,
    'trialing',
    NOW() + INTERVAL '14 days'
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (
    user_id,
    full_name,
    email,
    account_id,
    account_role,
    is_super_admin
  )
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    v_account_id,
    'owner',
    v_is_super
  );

  -- Ensure wallet is initialized for new account
  INSERT INTO public.wallets (account_id, balance, currency, is_active)
  VALUES (v_account_id, 0.0000, 'INR', true)
  ON CONFLICT (account_id) DO NOTHING;

  -- Seed default system tags
  INSERT INTO public.tags (account_id, user_id, name, color)
  VALUES
    (v_account_id, NEW.id, 'Interested', '#10b981'),
    (v_account_id, NEW.id, 'Not Interested', '#ef4444')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Drop trigger if it already exists to prevent duplicate execution
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
