import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBrevoOtpEmail } from "@/lib/email/brevo";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    const cleanEmail = email?.trim()?.toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // Generate login OTP link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: cleanEmail,
    });

    if (error) {
      console.error("[send-login-otp] generateLink error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to generate verification code." },
        { status: 400 }
      );
    }

    // If the user didn't exist prior to this call, GoTrue creates an unconfirmed user with verification_type "signup"
    if (data?.properties?.verification_type === "signup" && !data?.user?.email_confirmed_at) {
      if (data?.user?.id) {
        try {
          await supabaseAdmin.from("accounts").delete().eq("owner_user_id", data.user.id);
          await supabaseAdmin.auth.admin.deleteUser(data.user.id);
        } catch {
          // ignore cleanup errors
        }
      }
      return NextResponse.json(
        { error: "No account found with this email. Please sign up first." },
        { status: 404 }
      );
    }

    const otp = data?.properties?.email_otp;
    if (!otp) {
      console.error("[send-login-otp] No email_otp in response:", data);
      return NextResponse.json(
        { error: "Could not generate verification code. Please try again." },
        { status: 500 }
      );
    }

    const userName = (data.user?.user_metadata?.full_name as string) || cleanEmail.split("@")[0];

    // Dispatch via Brevo
    const emailResult = await sendBrevoOtpEmail({
      toEmail: cleanEmail,
      toName: userName,
      otp,
      type: "login",
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || "Failed to deliver OTP email." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[send-login-otp] Exception:", msg);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
