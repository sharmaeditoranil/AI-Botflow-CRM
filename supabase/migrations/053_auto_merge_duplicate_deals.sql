-- =====================================================================
-- Migration 053: Automated Pipeline Deal Deduplication & Merge
-- 
-- Guarantees that any deal added (via Automation, AI, or Human) for an
-- existing customer (matching contact_id or phone number) automatically
-- merges notes, follow-up timeline, instructions, and stage into the
-- existing deal instead of creating a duplicate row on the pipeline board.
-- =====================================================================

CREATE OR REPLACE FUNCTION trg_auto_merge_pipeline_deal()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_id UUID;
  v_existing_notes TEXT;
  v_existing_instructions TEXT;
  v_contact_phone TEXT;
BEGIN
  -- Obtain the phone number for the contact being inserted, if available
  IF NEW.contact_id IS NOT NULL THEN
    SELECT phone INTO v_contact_phone FROM contacts WHERE id = NEW.contact_id;
  END IF;

  -- Look for an existing deal for this customer in the same account
  SELECT d.id, d.notes, d.followup_instructions
    INTO v_existing_id, v_existing_notes, v_existing_instructions
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
   WHERE d.account_id = NEW.account_id
     AND (
       (NEW.contact_id IS NOT NULL AND d.contact_id = NEW.contact_id)
       OR (v_contact_phone IS NOT NULL AND trim(v_contact_phone) <> '' AND c.phone = v_contact_phone)
     )
   ORDER BY (CASE WHEN d.status = 'open' THEN 1 ELSE 0 END) DESC, d.created_at DESC
   LIMIT 1;

  -- If an existing deal is found, merge notes and update it instead of creating a second deal
  IF v_existing_id IS NOT NULL THEN
    UPDATE deals
       SET notes = CASE
                     WHEN v_existing_notes IS NULL OR trim(v_existing_notes) = '' THEN NEW.notes
                     WHEN NEW.notes IS NULL OR trim(NEW.notes) = '' THEN v_existing_notes
                     WHEN position(trim(NEW.notes) IN v_existing_notes) > 0 THEN v_existing_notes
                     WHEN position(trim(v_existing_notes) IN NEW.notes) > 0 THEN NEW.notes
                     ELSE v_existing_notes || E'\n' || NEW.notes
                   END,
           stage_id = COALESCE(NEW.stage_id, stage_id),
           pipeline_id = COALESCE(NEW.pipeline_id, pipeline_id),
           title = CASE
                     WHEN NEW.title IS NOT NULL AND NEW.title <> 'Deal' AND NEW.title NOT ILIKE 'Deal: Customer%'
                     THEN NEW.title
                     ELSE title
                   END,
           value = CASE WHEN NEW.value IS NOT NULL AND NEW.value > 0 THEN NEW.value ELSE value END,
           status = 'open',
           expected_close_date = COALESCE(NEW.expected_close_date, expected_close_date),
           ai_followup_enabled = COALESCE(NEW.ai_followup_enabled, ai_followup_enabled),
           followup_instructions = CASE
             WHEN v_existing_instructions IS NULL THEN NEW.followup_instructions
             WHEN NEW.followup_instructions IS NULL THEN v_existing_instructions
             WHEN position(trim(NEW.followup_instructions) IN v_existing_instructions) > 0 THEN v_existing_instructions
             ELSE v_existing_instructions || E'\n' || NEW.followup_instructions
           END,
           conversation_id = COALESCE(NEW.conversation_id, conversation_id),
           assigned_to = COALESCE(NEW.assigned_to, assigned_to),
           updated_at = NOW()
     WHERE id = v_existing_id;

    -- Returning NULL cancels the insert of a duplicate row cleanly
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to deals table
DROP TRIGGER IF EXISTS trg_deals_auto_merge ON deals;
CREATE TRIGGER trg_deals_auto_merge
  BEFORE INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_merge_pipeline_deal();
