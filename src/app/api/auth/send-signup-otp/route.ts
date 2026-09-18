import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBrevoOtpEmail } from "@/lib/email/brevo";

export async function POST(request: Request) {
  try {
    const { email, password, fullName, workspaceName } = await request.json();
    const cleanEmail = email?.trim()?.toLowerCase();
    const cleanName = fullName?.trim() || "";
    const cleanWorkspace = workspaceName?.trim() || "";

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // Call generateLink for signup
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          workspace_name: cleanWorkspace,
        },
      },
    });

    if (error) {
      console.error("[send-signup-otp] generateLink error:", error);
      if (error.message?.toLowerCase().includes("already been registered") || (error as { code?: string | number }).code === 422) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please sign in instead." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: error.message || "Failed to initiate account creation." },
        { status: 400 }
      );
    }

    const otp = data?.properties?.email_otp;
    if (!otp) {
      console.error("[send-signup-otp] No email_otp in response:", data);
      return NextResponse.json(
        { error: "Could not generate verification code. Please try again." },
        { status: 500 }
      );
    }

    // Dispatch via Brevo
    const emailResult = await sendBrevoOtpEmail({
      toEmail: cleanEmail,
      toName: cleanName || cleanEmail.split("@")[0],
      otp,
      type: "signup",
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || "Failed to send verification email." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[send-signup-otp] Exception:", msg);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
