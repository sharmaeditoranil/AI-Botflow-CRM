import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deal, DealStatus } from "@/types";

export interface MergeDealInput {
  account_id: string;
  user_id?: string;
  contact_id?: string | null;
  pipeline_id: string;
  stage_id: string;
  title: string;
  value?: number | null;
  currency?: string;
  notes?: string | null;
  expected_close_date?: string | null;
  assigned_to?: string | null;
  conversation_id?: string | null;
  ai_followup_enabled?: boolean;
  followup_instructions?: string | null;
  status?: DealStatus;
}

export interface MergeDealResult {
  dealId: string;
  merged: boolean;
  deal: any;
}

/**
 * Cleanly merges existing notes and incoming notes without duplicate lines.
 * Preserves timestamps, follow-up timelines ([Follow-up #N...]), and AI updates.
 */
export function mergeDealNotes(
  existingNotes?: string | null,
  incomingNotes?: string | null
): string | null {
  const existing = (existingNotes || "").trim();
  const incoming = (incomingNotes || "").trim();

  if (!existing && !incoming) return null;
  if (!existing) return incoming;
  if (!incoming) return existing;

  // If already identical or already present
  if (existing === incoming || existing.includes(incoming)) {
    return existing;
  }
  if (incoming.includes(existing)) {
    return incoming;
  }

  // Format incoming note if it does not already start with a structured badge [Badge...]
  if (incoming.startsWith("[")) {
    return `${existing}\n${incoming}`;
  }

  const todayStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${existing}\n[Merged Note ${todayStr}]: ${incoming}`;
}

/**
 * Merges follow-up instructions so custom guidance is preserved.
 */
export function mergeFollowupInstructions(
  existingInst?: string | null,
  incomingInst?: string | null
): string | null {
  const existing = (existingInst || "").trim();
  const incoming = (incomingInst || "").trim();

  if (!existing && !incoming) return null;
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (existing === incoming || existing.includes(incoming)) return existing;
  if (incoming.includes(existing)) return incoming;

  return `${existing}\n\n[Additional Instructions]:\n${incoming}`;
}

/**
 * Searches for any existing deal belonging to this customer in the account.
 * Matches either by contact_id OR by matching the customer's phone number
 * across all contact records in the same account.
 */
export async function findExistingDealsForCustomer(
  db: SupabaseClient | any,
  params: {
    accountId: string;
    contactId?: string | null;
    phone?: string | null;
  }
): Promise<any[]> {
  const candidateContactIds = new Set<string>();
  if (params.contactId) {
    candidateContactIds.add(params.contactId);
  }

  let phone = params.phone?.trim();

  // If phone wasn't passed, lookup contact to fetch phone number
  if (!phone && params.contactId) {
    const { data: c } = await db
      .from("contacts")
      .select("phone")
      .eq("id", params.contactId)
      .maybeSingle();
    if (c?.phone) {
      phone = c.phone.trim();
    }
  }

  // If contact has a phone number, find all other contact IDs in this account with the same phone
  if (phone) {
    const cleanDigits = phone.replace(/\D/g, "");
    const { data: matchingContacts } = await db
      .from("contacts")
      .select("id, phone")
      .eq("account_id", params.accountId);

    if (matchingContacts) {
      for (const mc of matchingContacts) {
        if (!mc.phone) continue;
        const mcDigits = mc.phone.replace(/\D/g, "");
        if (mcDigits && (mcDigits === cleanDigits || mc.phone.trim() === phone)) {
          candidateContactIds.add(mc.id);
        }
      }
    }
  }

  if (candidateContactIds.size === 0) {
    return [];
  }

  // Fetch all existing deals for these contact IDs
  const { data: existingDeals, error } = await db
    .from("deals")
    .select(
      "id, account_id, user_id, pipeline_id, stage_id, contact_id, conversation_id, title, value, currency, notes, expected_close_date, status, assigned_to, ai_followup_enabled, followup_instructions, created_at, updated_at"
    )
    .eq("account_id", params.accountId)
    .in("contact_id", Array.from(candidateContactIds))
    .order("created_at", { ascending: false });

  if (error || !existingDeals) {
    return [];
  }

  // Prioritize active/open deals over won/lost
  return existingDeals.sort((a: any, b: any) => {
    const aOpen = a.status === "open" ? 1 : 0;
    const bOpen = b.status === "open" ? 1 : 0;
    return bOpen - aOpen;
  });
}

/**
 * Finds an existing deal for the customer or creates a new one.
 * If an existing deal is found, it automatically merges notes, follow-up timeline,
 * value, instructions, and updates the stage/pipeline without creating a duplicate.
 * Also self-heals by combining and cleaning up any multiple legacy duplicate deals.
 */
export async function findAndMergeOrCreateDeal(
  db: SupabaseClient | any,
  input: MergeDealInput
): Promise<MergeDealResult> {
  const existingDeals = await findExistingDealsForCustomer(db, {
    accountId: input.account_id,
    contactId: input.contact_id,
  });

  if (existingDeals.length > 0) {
    // Primary deal to keep (first open deal or newest deal)
    const primary = existingDeals[0];

    // If there were multiple duplicate deals for this customer, merge all their notes together
    let mergedNotes = primary.notes || null;
    let mergedInstructions = primary.followup_instructions || null;

    if (existingDeals.length > 1) {
      const duplicateIds: string[] = [];
      for (let i = 1; i < existingDeals.length; i++) {
        const dupe = existingDeals[i];
        duplicateIds.push(dupe.id);
        mergedNotes = mergeDealNotes(mergedNotes, dupe.notes);
        mergedInstructions = mergeFollowupInstructions(
          mergedInstructions,
          dupe.followup_instructions
        );
      }
      // Self-heal: remove the redundant duplicate deal rows
      if (duplicateIds.length > 0) {
        await db.from("deals").delete().in("id", duplicateIds);
      }
    }

    // Now merge the incoming new deal data into the consolidated notes & instructions
    mergedNotes = mergeDealNotes(mergedNotes, input.notes);
    mergedInstructions = mergeFollowupInstructions(
      mergedInstructions,
      input.followup_instructions
    );

    // Determine updated values
    const updatedValue =
      typeof input.value === "number" && input.value > 0
        ? input.value
        : primary.value ?? null;

    const updatedTitle =
      input.title &&
      input.title !== "Deal" &&
      !input.title.toLowerCase().startsWith("deal: customer")
        ? input.title.trim()
        : primary.title;

    const updatedPayload: any = {
      pipeline_id: input.pipeline_id || primary.pipeline_id,
      stage_id: input.stage_id || primary.stage_id,
      title: updatedTitle,
      value: updatedValue,
      currency: input.currency || primary.currency || "INR",
      notes: mergedNotes,
      status: "open", // Reopen if previously closed so it appears active on board
      updated_at: new Date().toISOString(),
    };

    if (input.contact_id) updatedPayload.contact_id = input.contact_id;
    if (input.assigned_to) updatedPayload.assigned_to = input.assigned_to;
    if (input.conversation_id) updatedPayload.conversation_id = input.conversation_id;
    if (input.expected_close_date) updatedPayload.expected_close_date = input.expected_close_date;
    if (typeof input.ai_followup_enabled === "boolean") {
      updatedPayload.ai_followup_enabled = input.ai_followup_enabled;
    }
    if (mergedInstructions) {
      updatedPayload.followup_instructions = mergedInstructions;
    }

    const { data: updatedDeal, error: updateErr } = await db
      .from("deals")
      .update(updatedPayload)
      .eq("id", primary.id)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error("[deal-merger] Error updating merged deal:", updateErr);
      throw updateErr;
    }

    return {
      dealId: primary.id,
      merged: true,
      deal: updatedDeal || { ...primary, ...updatedPayload },
    };
  }

  // No existing deal exists for this contact/phone -> insert brand new deal
  const insertPayload = {
    account_id: input.account_id,
    user_id: input.user_id,
    pipeline_id: input.pipeline_id,
    stage_id: input.stage_id,
    contact_id: input.contact_id,
    conversation_id: input.conversation_id || null,
    assigned_to: input.assigned_to || null,
    title: input.title.trim(),
    value: typeof input.value === "number" ? input.value : null,
    currency: input.currency || "INR",
    notes: input.notes?.trim() || null,
    expected_close_date: input.expected_close_date || null,
    status: input.status || "open",
    ai_followup_enabled: input.ai_followup_enabled !== false,
    followup_instructions: input.followup_instructions?.trim() || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: newDeal, error: insertErr } = await db
    .from("deals")
    .insert(insertPayload)
    .select()
    .maybeSingle();

  if (insertErr) {
    console.error("[deal-merger] Error inserting new deal:", insertErr);
    throw insertErr;
  }

  return {
    dealId: newDeal?.id,
    merged: false,
    deal: newDeal,
  };
}
