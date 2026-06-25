import { Resend } from "resend";
import { env } from "../../config/index.js";
import { AppError } from "../../shared/index.js";
import type { SubmitInquiryBody } from "./support.validation.js";

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

export async function sendSupportInquiry(
  data: SubmitInquiryBody,
  userAccountEmail: string
): Promise<void> {
  if (!env.MAIL_TO) {
    throw AppError.internal("Support email recipient not configured (MAIL_TO missing)");
  }

  const client = getResendClient();

  await client.emails.send({
    from: env.EMAIL_FROM,
    to: env.MAIL_TO,
    subject: `[Support] ${data.category}: ${data.subject}`,
    replyTo: data.email,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">New Support Inquiry</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; color: #555; width: 140px;">Name</td>
            <td style="padding: 8px 12px;">${data.name}</td>
          </tr>
          <tr style="background: #f9fafb;">
            <td style="padding: 8px 12px; font-weight: bold; color: #555;">Account Email</td>
            <td style="padding: 8px 12px;"><a href="mailto:${userAccountEmail}">${userAccountEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; color: #555;">Contact Email</td>
            <td style="padding: 8px 12px;"><a href="mailto:${data.email}">${data.email}</a></td>
          </tr>
          <tr style="background: #f9fafb;">
            <td style="padding: 8px 12px; font-weight: bold; color: #555;">Category</td>
            <td style="padding: 8px 12px;">${data.category}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; color: #555;">Subject</td>
            <td style="padding: 8px 12px;">${data.subject}</td>
          </tr>
        </table>
        <div style="margin-top: 16px; padding: 16px; background: #f4f4f5; border-radius: 8px;">
          <h4 style="margin: 0 0 8px; color: #555;">Message:</h4>
          <p style="margin: 0; white-space: pre-wrap; color: #333;">${data.message}</p>
        </div>
      </div>
    `,
  });
}
