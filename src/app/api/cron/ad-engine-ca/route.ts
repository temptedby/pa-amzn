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
  // CAD, so the kill bar is CAD 5.50 rather than a bare 4. See KILL_SPEND_BY_CURRENCY.
  const result = await runAdEngine({ dryRun, profileId, currency: "CAD" });

  // ROUTINE RUNS ARE SILENT. William 2026-08-27: "telegram it is please i dont want to fill the
  // inbox". At hourly, across three countries, a mail per acting run is up to 72 a day. The
  // hourly watchdog reports what the engine did; this route now speaks up only when it BROKE.
  //
  // Errors still mail, because a run that threw is the one case where staying quiet is
  // indistinguishable from a run that never happened.
  if (!dryRun && result.errors.length) {
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads CA] Canada ad engine ran with errors`, text: summarizeAdEngine(result) })
      .catch((e) => console.error("[ad-engine-ca] email failed:", e));
  }

  return NextResponse.json({ marketplace: "CA", profileId, ...result });
}
