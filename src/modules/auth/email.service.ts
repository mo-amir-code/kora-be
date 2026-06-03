import { Resend } from "resend";
import { env } from "../../config/index.js";
import { AppError } from "../../shared/index.js";

let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw AppError.internal("Email service not configured (RESEND_API_KEY missing)");
  }
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendOtpEmail(
  to: string,
  name: string,
  otp: string
): Promise<void> {
  const client = getResendClient();

  await client.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Your password reset code",
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Hi ${name},</h2>
        <p>Your password reset code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; text-align: center; padding: 20px; background: #f4f4f5; border-radius: 8px;">
          ${otp}
        </div>
        <p style="color: #71717a; margin-top: 16px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}
