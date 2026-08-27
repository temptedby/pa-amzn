import { NextResponse } from "next/server";
import { gatherWatch, formatWatch, isClean, markHeartbeatSent } from "@/lib/amazon/engine-watch";
import { sendTelegram, telegramConfigured } from "@/lib/notify/telegram";
import { sendEmail, alertRecipient } from "@/lib/email";

// THE HOURLY WATCHDOG. William 2026-08-27.
//
// Runs at :15, which is deliberate. The cycle it judges is the PREVIOUS hour's: warm at :00,
// Canada :20, Mexico :25, Products :40, Brands :50, Display :55. By :15 the next hour every one
// of those has finished and its report has been collected. "make sure it is timed to allow for
// the reports to run" — Amazon's queue was measured at 39 minutes median at midday, so judging
// the current hour would be judging work that has not happened.
//
// TELEGRAM, NOT EMAIL. "telegram it is please i dont want to fill the inbox". Email is the
// fallback only, so a failed Telegram send cannot make an alert disappear — which is exactly what
// happened for twenty days when production had no RESEND_API_KEY and every send failed silently.
//
// SILENT WHEN CLEAN, except one heartbeat a day. Without the heartbeat, a dead watchdog and a
// healthy account look identical from the outside.
//
// ?dryRun=1 returns the text without sending. Auth: Bearer CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";

  const report = await gatherWatch();
  const clean = isClean(report);
  const text = formatWatch(report);

  if (dryRun) return NextResponse.json({ dryRun: true, clean, heartbeat: report.heartbeat, text, report });

  // Nothing wrong and no heartbeat owed -> say nothing at all. That is the point.
  if (clean && !report.heartbeat && !force) {
    return NextResponse.json({ ok: true, clean: true, sent: false, reason: "clean, nothing to report" });
  }

  let channel = "none";
  let error: string | undefined;
  if (telegramConfigured()) {
    const r = await sendTelegram(text);
    channel = "telegram";
    if (!r.ok) {
      error = r.error;
      // Telegram refused for a real reason. Do NOT let the alert evaporate.
      const fb = await sendEmail({
        to: alertRecipient(),
        subject: clean ? "[PA-AMZN watchdog] daily heartbeat (Telegram failed)" : "[PA-AMZN watchdog] ISSUES (Telegram failed)",
        text,
      }).catch(() => null);
      channel = fb?.ok ? "email-fallback" : "failed";
    }
  } else {
    const r = await sendEmail({
      to: alertRecipient(),
      subject: clean ? "[PA-AMZN watchdog] daily heartbeat" : "[PA-AMZN watchdog] ISSUES",
      text,
    });
    channel = r.ok ? "email" : "failed";
    error = r.error;
  }

  if (clean && report.heartbeat && channel !== "failed") await markHeartbeatSent();

  return NextResponse.json({
    ok: channel !== "failed",
    clean,
    heartbeat: report.heartbeat,
    sent: true,
    channel,
    error,
    violations: report.violations.length,
    unread: report.unread.length,
    late: report.lateScopes,
  });
}
