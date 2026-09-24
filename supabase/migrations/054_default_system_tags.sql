-- ============================================================
-- 054_default_system_tags
--
-- Ensure every account has default core tags ("Interested", "Not Interested")
-- that are used by AI Auto-Tagging, Automations, and CRM Deal qualification.
-- Protects these system tags from accidental deletion so automations never break.
-- ============================================================

-- 1. Add is_system column to tags if not exists
ALTER TABLE public.tags 
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- 2. Mark existing "Interested" and "Not Interested" tags as system tags
UPDATE public.tags
SET is_system = true
WHERE LOWER(TRIM(name)) IN ('interested', 'not interested');

-- 3. Seed "Interested" and "Not Interested" for all existing accounts that don't have them
INSERT INTO public.tags (account_id, user_id, name, color, is_system)
SELECT a.id, a.owner_user_id, 'Interested', '#10b981', true
FROM public.accounts a
WHERE a.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tags t 
    WHERE t.account_id = a.id AND LOWER(TRIM(t.name)) = 'interested'
  );

INSERT INTO public.tags (account_id, user_id, name, color, is_system)
SELECT a.id, a.owner_user_id, 'Not Interested', '#ef4444', true
FROM public.accounts a
WHERE a.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tags t 
    WHERE t.account_id = a.id AND LOWER(TRIM(t.name)) = 'not interested'
  );

-- 4. Update handle_new_user() trigger to automatically create default tags on account signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  -- Seed system default tags for the newly created account
  INSERT INTO public.tags (account_id, user_id, name, color, is_system)
  VALUES 
    (v_account_id, NEW.id, 'Interested', '#10b981', true),
    (v_account_id, NEW.id, 'Not Interested', '#ef4444', true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 5. Add trigger to prevent accidental deletion of core system tags
CREATE OR REPLACE FUNCTION public.protect_system_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system = true OR LOWER(TRIM(OLD.name)) IN ('interested', 'not interested') THEN
    RAISE EXCEPTION 'Cannot delete core system tag "%" (used by AI Auto-Tagging & Automations).', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_system_tags ON public.tags;
CREATE TRIGGER trg_protect_system_tags
  BEFORE DELETE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_system_tags();
