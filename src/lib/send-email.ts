/**
 * Send transactional emails (e.g. new login alert).
 * Uses Resend when RESEND_API_KEY is set; otherwise no-op.
 */

import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "GarmonPay <noreply@garmonpay.com>";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendNewLoginAlert(params: {
  to: string;
  ip: string;
  userAgent?: string;
}): Promise<boolean> {
  if (!resend) return false;
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: "New login to your GarmonPay account",
      html: `
        <p>A new login to your GarmonPay account was detected.</p>
        <p><strong>IP address:</strong> ${params.ip}</p>
        ${params.userAgent ? `<p><strong>Device:</strong> ${params.userAgent}</p>` : ""}
        <p>If this wasn't you, please reset your password immediately and contact support.</p>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}
