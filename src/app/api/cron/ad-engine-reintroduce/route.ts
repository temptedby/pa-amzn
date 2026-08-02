import { NextResponse } from "next/server";
import { runReintroduction, summarizeReintroduction } from "@/lib/amazon/ad-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// Rule 4 of .agent/ad-engine-rules-2026-08-02.md — walk keywords stuck at the $0.10 floor back on,
// at most 10 a day, only if they never spent or spent at ACOS < 50%.
//
// SAFETY: this switches on live ad spend, so it PREVIEWS unless AD_REINTRO_ENABLED=1 is set in the
// environment. Rule 5 gates that flag: reintroduction stays in preview until the `run` heartbeat in
// ad_engine_log proves the 6-hourly cron actually fires on schedule, because the $4 cutoff is only
// as reliable as the job that enforces it. ?dryRun=1 forces preview regardless.
// Auth: Bearer CRON_SECRET (Vercel injects it).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forcedPreview = new URL(request.url).searchParams.get("dryRun") === "1";
  const enabled = process.env.AD_REINTRO_ENABLED === "1";
  const dryRun = forcedPreview || !enabled;

  const result = await runReintroduction({ dryRun });

  if (!dryRun && (result.promoted.length || result.errors.length)) {
    const subject = result.errors.length
      ? "Reintroduction ran with errors"
      : `Reintroduction: ${result.promoted.length} keywords brought back`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] ${subject}`, text: summarizeReintroduction(result) })
      .catch((e) => console.error("[ad-engine-reintroduce] email failed:", e));
  }

  return NextResponse.json({ ...result, enabled });
}
