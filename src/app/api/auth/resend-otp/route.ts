import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBrevoOtpEmail } from "@/lib/email/brevo";

export async function POST(request: Request) {
  try {
    const { email, type = "login" } = await request.json();
    const cleanEmail = email?.trim()?.toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // Call generateLink for magiclink
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: cleanEmail,
    });

    if (error) {
      console.error("[resend-otp] generateLink error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to resend verification code." },
        { status: 400 }
      );
    }

    const otp = data?.properties?.email_otp;
    if (!otp) {
      return NextResponse.json(
        { error: "Could not generate verification code. Please try again." },
        { status: 500 }
      );
    }

    const userName = (data.user?.user_metadata?.full_name as string) || cleanEmail.split("@")[0];

    const emailResult = await sendBrevoOtpEmail({
      toEmail: cleanEmail,
      toName: userName,
      otp,
      type: type === "signup" ? "signup" : "login",
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || "Failed to deliver OTP email." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[resend-otp] Exception:", msg);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
