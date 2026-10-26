// ============================================================
// /api/account/members
//
// GET  — Lists every member of the caller's account. Any member can call.
// POST — Directly adds an existing user to the team if their account has
//        no conflicting data, or generates an invite link for their email.
//        Admin+.
// ============================================================

import { NextResponse } from "next/server";
import { getCurrentAccount, requireRole, toErrorResponse } from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateInviteToken,
  inviteExpiresAt,
  inviteUrl,
} from "@/lib/auth/invitations";
import { getBaseUrl } from "@/app/api/account/invitations/route";
import type { AccountMember } from "@/types";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, account_role, created_at")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/account/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = (data as ProfileRow[]).flatMap((row) => {
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? "",
          email: canSeeEmails ? row.email : null,
          avatar_url: row.avatar_url,
          role: row.account_role,
          joined_at: row.created_at,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const admin = createAdminClient();

    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      role?: unknown;
    } | null;

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
    const role = body?.role;

    if (!isAccountRole(role) || role === "owner") {
      return NextResponse.json(
        { error: "'role' must be one of admin, agent, viewer" },
        { status: 400 },
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 },
      );
    }

    // 1. Check if user already registered with this email
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id, user_id, full_name, email, account_id, account_role")
      .ilike("email", email)
      .maybeSingle();

    if (targetProfile) {
      if (targetProfile.account_id === ctx.accountId) {
        return NextResponse.json(
          { error: "This user is already a member of your team" },
          { status: 400 },
        );
      }

      const targetOldAccountId = targetProfile.account_id;

      // Check if their current account has other members
      const { count: memberCount } = await admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("account_id", targetOldAccountId);

      if ((memberCount ?? 0) > 1) {
        return NextResponse.json(
          {
            error:
              "This user is already part of another shared team. They must use an invite link or separate login.",
          },
          { status: 409 },
        );
      }

      // Check if their existing account has real customer data
      const [
        { count: cCount },
        { count: convCount },
        { count: bCount },
        { count: wCount },
      ] = await Promise.all([
        admin
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("account_id", targetOldAccountId),
        admin
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("account_id", targetOldAccountId),
        admin
          .from("broadcasts")
          .select("*", { count: "exact", head: true })
          .eq("account_id", targetOldAccountId),
        admin
          .from("whatsapp_config")
          .select("*", { count: "exact", head: true })
          .eq("account_id", targetOldAccountId),
      ]);

      if (
        (cCount ?? 0) > 0 ||
        (convCount ?? 0) > 0 ||
        (bCount ?? 0) > 0 ||
        (wCount ?? 0) > 0
      ) {
        return NextResponse.json(
          {
            error:
              "This user already has an active account with existing contacts or WhatsApp numbers. Share an invite link with them instead.",
          },
          { status: 409 },
        );
      }

      // Move directly into this account
      const { error: updateErr } = await admin
        .from("profiles")
        .update({
          account_id: ctx.accountId,
          account_role: role,
        })
        .eq("id", targetProfile.id);

      if (updateErr) {
        console.error(
          "[POST /api/account/members] profile transfer error:",
          updateErr,
        );
        return NextResponse.json(
          { error: "Failed to add member to team" },
          { status: 500 },
        );
      }

      // Cleanup orphan account
      if (targetOldAccountId && targetOldAccountId !== ctx.accountId) {
        try {
          await admin
            .from("tags")
            .delete()
            .eq("account_id", targetOldAccountId);
          await admin
            .from("pipelines")
            .delete()
            .eq("account_id", targetOldAccountId);
          await admin
            .from("wallets")
            .delete()
            .eq("account_id", targetOldAccountId);
          await admin
            .from("accounts")
            .delete()
            .eq("id", targetOldAccountId);
        } catch (e) {
          console.warn("[POST /api/account/members] cleanup warning:", e);
        }
      }

      return NextResponse.json({
        ok: true,
        addedDirectly: true,
        member: {
          user_id: targetProfile.user_id,
          full_name: targetProfile.full_name || email.split("@")[0],
          email: targetProfile.email,
          role,
        },
      });
    }

    // 2. User has not registered yet: create an invitation link for this email
    const { token, hash } = generateInviteToken();
    const expiresAt = inviteExpiresAt(7);

    const { data: inv, error: invErr } = await admin
      .from("account_invitations")
      .insert({
        account_id: ctx.accountId,
        token_hash: hash,
        role,
        created_by_user_id: ctx.userId,
        label: email,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, role, label, expires_at, created_at")
      .single();

    if (invErr || !inv) {
      console.error("[POST /api/account/members] invite insert error:", invErr);
      return NextResponse.json(
        { error: "Failed to create invitation" },
        { status: 500 },
      );
    }

    const url = inviteUrl(token, getBaseUrl(request));

    return NextResponse.json(
      {
        ok: true,
        addedDirectly: false,
        invited: true,
        invitation: inv,
        token,
        url,
        email,
        expiresInDays: 7,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
