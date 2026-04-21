import { Resend } from "resend";

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  attachments?: Array<{ filename: string; content: Buffer | string }>;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// Default sender — Resend's onboarding domain works out of the box.
// Once phoneassured.com is verified with Resend, change EMAIL_FROM env var
// to "PA AMZN <alerts@phoneassured.com>".
const DEFAULT_FROM = "PA AMZN <onboarding@resend.dev>";

export function emailFromEnv(): string {
  return process.env.EMAIL_FROM ?? DEFAULT_FROM;
}

export function alertRecipient(): string {
  return process.env.ALERT_EMAIL ?? "hello@phoneassured.com";
}

export function resendConfigured(): boolean {
  return typeof process.env.RESEND_API_KEY === "string" && process.env.RESEND_API_KEY.length > 0;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };

  try {
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: args.from ?? emailFromEnv(),
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html,
      attachments: args.attachments,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
