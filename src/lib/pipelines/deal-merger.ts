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

    // Determine updated values (deals.value is NOT NULL with default 0 in PostgreSQL)
    const updatedValue =
      typeof input.value === "number" && !isNaN(input.value) && input.value > 0
        ? input.value
        : typeof primary.value === "number" && !isNaN(primary.value)
        ? primary.value
        : 0;

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
    if (input.expected_close_date && input.expected_close_date.trim()) {
      updatedPayload.expected_close_date = input.expected_close_date.trim();
    }
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
    value: typeof input.value === "number" && !isNaN(input.value) ? input.value : 0,
    currency: input.currency || "INR",
    notes: input.notes?.trim() || null,
    expected_close_date: input.expected_close_date && input.expected_close_date.trim() ? input.expected_close_date.trim() : null,
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

export interface ParsedDealLead {
  cleanTitle: string;
  service: string;
  city: string;
  leadMessage: string;
}

/**
 * Separates mixed titles like "Anil ku Sharma, Wedding Album Design, Gopalganj"
 * or notes with structured bullets into separate fields:
 * cleanTitle, service, city, and leadMessage.
 */
export function parseDealLeadDetails(
  rawTitle?: string | null,
  rawNotes?: string | null
): ParsedDealLead {
  const title = (rawTitle || "").trim();
  const notes = (rawNotes || "").trim();

  let service = "";
  let city = "";
  let leadMessage = "";

  // 1. Try parsing from notes if bullet lines exist (e.g. • Service: Wedding Album Design)
  if (notes) {
    const serviceMatch = notes.match(/•\s*(?:Service|Requirement|Service \/ Requirement)\s*:\s*([^\n\r]+)/i);
    if (serviceMatch && serviceMatch[1]) {
      service = serviceMatch[1].trim();
    }

    const cityMatch = notes.match(/•\s*(?:City|Location)\s*:\s*([^\n\r]+)/i);
    if (cityMatch && cityMatch[1]) {
      city = cityMatch[1].trim();
    }

    const messageMatch = notes.match(/•\s*(?:Extra Message|Message|Notes?|Requirements? Details?)\s*:\s*([^\n\r]+)/i);
    if (messageMatch && messageMatch[1]) {
      leadMessage = messageMatch[1].trim();
    }
  }

  // 2. Extract from title if title is mixed with comma, hyphen, or pipe
  // e.g. "Anil ku Sharma, Wedding Album Design, Gopalganj"
  let cleanTitle = title;

  if (title.includes(",")) {
    const parts = title.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      cleanTitle = parts[0];
      if (!service && parts[1]) {
        service = parts[1];
      }
      if (!city && parts[2]) {
        city = parts[2];
      }
    }
  } else if (title.includes(" - ")) {
    const parts = title.split(" - ").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      cleanTitle = parts[0].replace(/^Deal:\s*/i, "").trim();
      const rest = parts.slice(1).join(" - ");
      const cityInParenMatch = rest.match(/\(([^)]+)\)$/);
      if (cityInParenMatch) {
        if (!city) city = cityInParenMatch[1].trim();
        if (!service) service = rest.replace(/\(([^)]+)\)$/, "").trim();
      } else {
        if (!service) service = parts[1];
        if (!city && parts[2]) city = parts[2];
      }
    }
  } else if (title.includes(" | ")) {
    const parts = title.split(" | ").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      cleanTitle = parts[0];
      if (!service && parts[1]) service = parts[1];
      if (!city && parts[2]) city = parts[2];
    }
  }

  if (cleanTitle.toLowerCase().startsWith("deal: ")) {
    cleanTitle = cleanTitle.slice(6).trim();
  }

  return {
    cleanTitle: cleanTitle || title || "Deal",
    service,
    city,
    leadMessage,
  };
}

/**
 * Ensures Service, City, and Extra Message are cleanly saved in structured notes
 * without losing existing follow-up history or duplicating blocks.
 */
export function formatDealLeadNotes(
  currentNotes: string,
  service: string,
  city: string,
  leadMessage: string
): string {
  const cleanService = (service || "").trim();
  const cleanCity = (city || "").trim();
  const cleanMsg = (leadMessage || "").trim();

  if (!cleanService && !cleanCity && !cleanMsg) {
    return (currentNotes || "").trim();
  }

  const lines: string[] = ["[Lead Form Details]:"];
  if (cleanService) lines.push(`• Service: ${cleanService}`);
  if (cleanCity) lines.push(`• City: ${cleanCity}`);
  if (cleanMsg) lines.push(`• Extra Message: ${cleanMsg}`);
  const leadBlock = lines.join("\n");

  const notes = (currentNotes || "").trim();
  if (!notes) return leadBlock;

  const regex = /(?:\[[^\]]*\]:\s*)?\[Lead Form Details\]:\s*(?:•[^\n]*\n?)+/i;
  if (regex.test(notes)) {
    return notes.replace(regex, leadBlock).trim();
  }

  return `${leadBlock}\n\n${notes}`;
}

/**
 * Formats lead capture date for pipeline cards:
 * - "Today, 10:45 AM"
 * - "Yesterday, 4:20 PM"
 * - "28 Sep, 10:45 AM"
 * - "28 Sep 2025, 10:45 AM"
 */
export function formatCaptureDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  const dateFormatted = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });

  return `${dateFormatted}, ${timeStr}`;
}

/**
 * Returns human-readable relative age:
 * "Just now", "10m ago", "2h ago", "1d ago", "2w ago", "3mo ago"
 */
export function formatTimeAgo(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (isNaN(diffMs) || diffMs < 0) return "Just now";

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) return `${diffWeeks}w ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

/**
 * Formats full timestamp with exact date and time:
 * "28 Sep 2026, 10:45 AM"
 */
export function formatFullDateTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  const dateFormatted = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dateFormatted}, ${timeStr}`;
}

