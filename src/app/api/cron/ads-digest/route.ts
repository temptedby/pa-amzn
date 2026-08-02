import { NextResponse } from "next/server";
import { gatherAdsDigest, formatAdsDigest } from "@/lib/amazon/ads-digest";
import { sendTelegram, telegramConfigured } from "@/lib/notify/telegram";
import { sendEmail, alertRecipient } from "@/lib/email";

// Daily performance digest — "how are the models performing" without opening a terminal.
// Telegram when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set, otherwise it falls back to email
// so the report is never simply lost. Read-only: it reads the engine's own logs and sends.
// ?dryRun=1 returns the text without sending. Auth: Bearer CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const stats = await gatherAdsDigest();
  const text = formatAdsDigest(stats);
  if (dryRun) return NextResponse.json({ dryRun: true, text, stats });

  let channel = "none", error: string | undefined;
  if (telegramConfigured()) {
    const r = await sendTelegram(text);
    channel = "telegram";
    if (!r.ok) {
      error = r.error;
      // Telegram failed for a real reason (bad token, blocked bot) — do not lose the digest.
      const fb = await sendEmail({ to: alertRecipient(), subject: "[PA-AMZN ads] daily digest (Telegram failed)", text }).catch(() => null);
      channel = fb ? "email-fallback" : "failed";
    }
  } else {
    await sendEmail({ to: alertRecipient(), subject: "[PA-AMZN ads] daily digest", text })
      .catch((e) => { error = String(e); });
    channel = error ? "failed" : "email";
  }

  return NextResponse.json({ ok: !error, channel, error, stats });
}
