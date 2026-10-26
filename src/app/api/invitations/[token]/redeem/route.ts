// ============================================================
// POST /api/invitations/[token]/redeem
//
// Authenticated. Caller atomically moves from their personal
// account (created at signup) to the inviter's account with the
// invite's role.
//
// Solves the data-guard conflict caused by auto-seeded tags/pipelines
// created during signup (migration 056). Real domain data (contacts,
// conversations, broadcasts, whatsapp_config) is preserved and guarded.
// ============================================================

import { NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/auth/invitations";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`redeem:${ip}`, RATE_LIMITS.invitationRedeem);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Missing invitation token" },
      { status: 400 },
    );
  }

  // Verify caller's authenticated session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenHash = hashInviteToken(token);
  const admin = createAdminClient();

  // 1. Fetch invitation record
  const { data: inv, error: invErr } = await admin
    .from("account_invitations")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (invErr || !inv) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 400 },
    );
  }

  if (inv.accepted_at) {
    return NextResponse.json(
      { error: "Invitation has already been redeemed" },
      { status: 400 },
    );
  }

  if (new Date(inv.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Invitation has expired" },
      { status: 400 },
    );
  }

  // 2. Fetch caller's profile
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, account_id, account_role, full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profErr || !profile || !profile.account_id) {
    return NextResponse.json(
      { error: "Caller has no profile or account" },
      { status: 401 },
    );
  }

  // Prevent joining account they already belong to
  if (profile.account_id === inv.account_id) {
    return NextResponse.json(
      { error: "You are already a member of this account" },
      { status: 409 },
    );
  }

  const oldAccountId = profile.account_id;

  // 3. Check current account ownership & team status
  const { data: oldAccount } = await admin
    .from("accounts")
    .select("id, owner_user_id")
    .eq("id", oldAccountId)
    .maybeSingle();

  if (oldAccount && oldAccount.owner_user_id !== user.id) {
    return NextResponse.json(
      {
        error:
          "You are already in a shared account; sign up with a different email to join this one",
      },
      { status: 409 },
    );
  }

  // Ensure current account doesn't have other members
  const { count: memberCount } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("account_id", oldAccountId);

  if ((memberCount ?? 0) > 1) {
    return NextResponse.json(
      {
        error:
          "Your current account has other members; please sign up with a new email to join this team",
      },
      { status: 409 },
    );
  }

  // 4. Data-loss guard: only block if real domain data exists
  // (contacts, conversations, broadcasts, or connected whatsapp_config).
  // Note: We deliberately exclude default auto-seeded tags/pipelines from 056.
  const [
    { count: contactsCount },
    { count: convosCount },
    { count: broadcastsCount },
    { count: waConfigCount },
  ] = await Promise.all([
    admin
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("account_id", oldAccountId),
    admin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("account_id", oldAccountId),
    admin
      .from("broadcasts")
      .select("*", { count: "exact", head: true })
      .eq("account_id", oldAccountId),
    admin
      .from("whatsapp_config")
      .select("*", { count: "exact", head: true })
      .eq("account_id", oldAccountId),
  ]);

  if (
    (contactsCount ?? 0) > 0 ||
    (convosCount ?? 0) > 0 ||
    (broadcastsCount ?? 0) > 0 ||
    (waConfigCount ?? 0) > 0
  ) {
    return NextResponse.json(
      {
        error:
          "Your account already contains real customer data or a connected WhatsApp number; sign up with a new email to join this team",
      },
      { status: 409 },
    );
  }

  // 5. Transfer caller to new account
  const { error: updateProfErr } = await admin
    .from("profiles")
    .update({
      account_id: inv.account_id,
      account_role: inv.role,
    })
    .eq("user_id", user.id);

  if (updateProfErr) {
    console.error("[redeem] profile update failed:", updateProfErr);
    return NextResponse.json(
      { error: "Failed to update member profile" },
      { status: 500 },
    );
  }

  // 6. Mark invitation as accepted
  await admin
    .from("account_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: user.id,
    })
    .eq("id", inv.id);

  // 7. Clean up the empty personal account (and any auto-seeded tags/pipelines)
  try {
    await admin.from("tags").delete().eq("account_id", oldAccountId);
    await admin.from("pipelines").delete().eq("account_id", oldAccountId);
    await admin.from("wallets").delete().eq("account_id", oldAccountId);
    await admin.from("accounts").delete().eq("id", oldAccountId);
  } catch (cleanErr) {
    console.warn("[redeem] cleanup orphan account non-fatal warning:", cleanErr);
  }

  return NextResponse.json({ ok: true, accountId: inv.account_id });
}
