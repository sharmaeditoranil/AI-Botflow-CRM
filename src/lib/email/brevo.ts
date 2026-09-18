interface SendBrevoOtpParams {
  toEmail: string;
  toName?: string;
  otp: string;
  type: "login" | "signup";
}

export async function sendBrevoOtpEmail({
  toEmail,
  toName,
  otp,
  type,
}: SendBrevoOtpParams): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "anilkushrm@gmail.com";
  const senderName = process.env.BREVO_SENDER_NAME || "AI Botflow";

  if (!apiKey) {
    console.error("[Brevo] Missing BREVO_API_KEY environment variable");
    return { success: false, error: "Email service not configured (missing API key)" };
  }

  const isSignup = type === "signup";
  const subject = isSignup
    ? `${otp} is your AI Botflow verification code`
    : `${otp} is your AI Botflow login code`;

  const displayName = toName && toName.trim() ? toName.trim() : toEmail.split("@")[0];
  const actionTitle = isSignup ? "Verify Your Email Address" : "Sign In Verification";
  const actionDesc = isSignup
    ? "Welcome to <strong>AI Botflow CRM</strong>! To finish setting up your account, please verify your email address using the one-time verification code below:"
    : "We received a request to access your <strong>AI Botflow CRM</strong> account. Use the one-time verification code below to securely sign in:";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>${subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      background-color: #090d16;
    }
    img {
      border: 0;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    @media only screen and (max-width: 600px) {
      .container {
        width: 100% !important;
        padding: 16px !important;
      }
      .card {
        padding: 24px 20px !important;
      }
      .otp-code {
        font-size: 32px !important;
        letter-spacing: 6px !important;
      }
    }
  </style>
</head>
<body style="background-color: #090d16; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; margin: 0; padding: 40px 12px;">

  <!-- Outer wrapper -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="container" style="max-width: 540px; margin: 0 auto;">
          
          <!-- Brand Header -->
          <tr>
            <td align="center" style="padding-bottom: 28px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); padding: 2px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.25);">
                      <div style="background-color: #0f172a; padding: 10px 24px; border-radius: 10px;">
                        <span style="font-size: 17px; font-weight: 800; color: #ffffff; letter-spacing: 1px;">
                          ⚡ AI BOTFLOW <span style="color: #10b981; font-weight: 600; font-size: 14px;">CRM</span>
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="font-size: 12px; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600;">
                      Next-Gen WhatsApp CRM & Automation
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Box -->
          <tr>
            <td>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="card" style="background-color: #111827; border: 1px solid #1f2937; border-radius: 18px; padding: 36px 32px; box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7);">
                
                <!-- Greeting & Title -->
                <tr>
                  <td style="padding-bottom: 20px;">
                    <div style="display: inline-block; padding: 4px 12px; background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; font-size: 12px; font-weight: 600; color: #34d399; margin-bottom: 14px;">
                      🔒 Security Verification
                    </div>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                      ${actionTitle}
                    </h1>
                    <p style="margin: 12px 0 0 0; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                      Hello <strong style="color: #f1f5f9;">${displayName}</strong>,
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                      ${actionDesc}
                    </p>
                  </td>
                </tr>

                <!-- OTP Code Display Card -->
                <tr>
                  <td align="center" style="padding: 16px 0 28px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(180deg, #0b1120 0%, #030712 100%); border: 1.5px solid #10b981; border-radius: 14px; box-shadow: 0 0 24px rgba(16, 185, 129, 0.15);">
                      <tr>
                        <td align="center" style="padding: 24px 20px;">
                          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #10b981; font-weight: 700; margin-bottom: 8px;">
                            Your One-Time Passcode
                          </div>
                          <div class="otp-code" style="font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace; font-size: 40px; font-weight: 800; letter-spacing: 8px; color: #34d399; text-shadow: 0 0 16px rgba(52, 211, 153, 0.35);">
                            ${otp}
                          </div>
                          <div style="margin-top: 10px; font-size: 12px; color: #64748b; font-weight: 500;">
                            ⏱️ Expires in <strong style="color: #f87171;">10 minutes</strong>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Instructions & Safety Tips -->
                <tr>
                  <td style="border-top: 1px solid #1f2937; padding-top: 22px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="20" valign="top" style="padding-right: 10px; font-size: 14px;">ℹ️</td>
                        <td style="font-size: 13px; line-height: 1.5; color: #cbd5e1;">
                          Enter this 6-digit code on the verification screen to complete your request.
                        </td>
                      </tr>
                      <tr>
                        <td height="12"></td>
                      </tr>
                      <tr>
                        <td width="20" valign="top" style="padding-right: 10px; font-size: 14px;">🛡️</td>
                        <td style="font-size: 13px; line-height: 1.5; color: #94a3b8;">
                          <strong>Never share this code.</strong> AI Botflow team members will never ask for your verification code or password.
                        </td>
                      </tr>
                    </table>

                    <!-- Security Alert Banner -->
                    <div style="margin-top: 24px; padding: 14px 16px; background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 10px;">
                      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #fca5a5;">
                        <strong>Didn't request this code?</strong> If you did not attempt to sign in or register, someone may have mistyped their email address. Your account remains completely safe and no action is needed.
                      </p>
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer Information -->
          <tr>
            <td align="center" style="padding: 28px 16px 0 16px;">
              <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 500;">
                Need assistance? Contact our team at <a href="mailto:support@aibotflow.in" style="color: #10b981; text-decoration: none;">support@aibotflow.in</a>
              </p>
              <p style="margin: 12px 0 0 0; font-size: 12px; color: #475569;">
                © ${new Date().getFullYear()} AI Botflow Technologies. All rights reserved.
              </p>
              <p style="margin: 6px 0 0 0; font-size: 11px; color: #334155;">
                This is an automated transactional message sent securely via Brevo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [
          {
            email: toEmail,
            name: displayName,
          },
        ],
        subject,
        htmlContent,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[Brevo] Email dispatch failed:", data);
      return {
        success: false,
        error: data.message || `Failed to send email (Status: ${res.status})`,
      };
    }

    return {
      success: true,
      messageId: data.messageId,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown network error";
    console.error("[Brevo] Network error dispatching email:", msg);
    return {
      success: false,
      error: msg,
    };
  }
}
