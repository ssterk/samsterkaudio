import type { Env } from "./env";

// Falls back to console.log when RESEND_API_KEY isn't configured, so local
// dev and preview environments keep working without a real provider — see
// the sendMagicLink/sendVerificationOTP call sites in auth.ts.
export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[pressing] (no RESEND_API_KEY set) email to ${to}: ${subject}\n${html}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? "Pressing <pressing@samsterkaudio.com>",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    console.error(`[pressing] Resend send failed (${res.status}): ${await res.text()}`);
  }
}
