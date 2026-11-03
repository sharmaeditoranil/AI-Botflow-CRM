-- ============================================================
-- 059_deal_payments
--
-- Payments received against a deal, so the deal shows what has been
-- paid and what is still due (deal value − payments).
--
--   deal_payments      one row per payment (amount, date, method, note)
--   deals.amount_paid  running total, kept in sync by trigger so the
--                      pipeline board can show "Due ₹X" without a join
--
-- A payment's account_id is always copied from its deal, so a member
-- can only record payments on their own account's deals.
--
-- Idempotent.
-- ============================================================

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.deal_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'upi'
    CHECK (method IN ('cash', 'upi', 'bank', 'card', 'cheque', 'other')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_payments_deal ON public.deal_payments (deal_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_deal_payments_account ON public.deal_payments (account_id);

ALTER TABLE public.deal_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_payments_select ON public.deal_payments;
CREATE POLICY deal_payments_select ON public.deal_payments
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS deal_payments_insert ON public.deal_payments;
CREATE POLICY deal_payments_insert ON public.deal_payments
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS deal_payments_update ON public.deal_payments;
CREATE POLICY deal_payments_update ON public.deal_payments
  FOR UPDATE USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS deal_payments_delete ON public.deal_payments;
CREATE POLICY deal_payments_delete ON public.deal_payments
  FOR DELETE USING (is_account_member(account_id, 'agent'));

-- account_id always follows the deal (runs before the RLS check).
CREATE OR REPLACE FUNCTION public.deal_payments_set_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT d.account_id INTO NEW.account_id FROM public.deals d WHERE d.id = NEW.deal_id;
  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'deal % not found', NEW.deal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_payments_set_account ON public.deal_payments;
CREATE TRIGGER trg_deal_payments_set_account
  BEFORE INSERT OR UPDATE OF deal_id, account_id ON public.deal_payments
  FOR EACH ROW EXECUTE FUNCTION public.deal_payments_set_account();

-- deals.amount_paid = sum of its payments.
CREATE OR REPLACE FUNCTION public.deal_payments_sync_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids UUID[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    ids := ARRAY[NEW.deal_id];
  ELSIF TG_OP = 'DELETE' THEN
    ids := ARRAY[OLD.deal_id];
  ELSE
    ids := ARRAY[OLD.deal_id, NEW.deal_id];
  END IF;

  UPDATE public.deals d
     SET amount_paid = COALESCE(
           (SELECT SUM(p.amount) FROM public.deal_payments p WHERE p.deal_id = d.id), 0)
   WHERE d.id = ANY (ids);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_payments_sync_total ON public.deal_payments;
CREATE TRIGGER trg_deal_payments_sync_total
  AFTER INSERT OR UPDATE OR DELETE ON public.deal_payments
  FOR EACH ROW EXECUTE FUNCTION public.deal_payments_sync_total();

REVOKE ALL ON FUNCTION public.deal_payments_set_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deal_payments_sync_total() FROM PUBLIC;
