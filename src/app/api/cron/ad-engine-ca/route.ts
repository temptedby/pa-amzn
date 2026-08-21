import { NextResponse } from "next/server";
import { runAdEngine, summarizeAdEngine } from "@/lib/amazon/ad-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// The same Sponsored-Products engine, pointed at the CANADIAN advertising account.
//
// A SEPARATE run per country, not one run looping both (William 2026-08-21). Three reasons:
//   - Vercel's 300s function budget is per invocation, so two countries in one run halves each.
//   - A failure in one country cannot take the other down. The US account carries the revenue.
//   - Each country's decisions land in ad_engine_log under their own run, so "what did the engine
//     do in Canada" is a query rather than a filter over a mixed run.
//
// Everything else is identical: the same shouldKill, the same bid rules, the same $4 bar read in
// CAD. The only difference is the profile scope, and reportKey is scoped per profile so this run
// cannot collect the US account's report rows.
//
// ?dryRun=1 previews without applying. Auth: Bearer CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileId = process.env.ADS_PROFILE_ID_CA;
  if (!profileId) {
    return NextResponse.json({ ok: false, reason: "ADS_PROFILE_ID_CA not configured" }, { status: 500 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runAdEngine({ dryRun, profileId });

  const acted = result.killed.length + result.bids.length + result.added.length > 0;
  if (!dryRun && (acted || result.errors.length)) {
    const subject = result.errors.length
      ? "Canada ad engine ran with errors"
      : `Canada ad engine: ${result.killed.length} paused, ${result.added.length} added, ${result.bids.length} re-bid`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads CA] ${subject}`, text: summarizeAdEngine(result) })
      .catch((e) => console.error("[ad-engine-ca] email failed:", e));
  }

  return NextResponse.json({ marketplace: "CA", profileId, ...result });
}
