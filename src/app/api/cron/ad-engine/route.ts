import { NextResponse } from "next/server";
import { runAdEngine, summarizeAdEngine } from "@/lib/amazon/ad-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// Autonomous Sponsored-Products engine. Vercel Cron invokes this on a schedule
// (see vercel.json) so it keeps optimizing with no local terminal involved:
//   - pause keywords that spent >= $4 with 0 orders (30d)
//   - add converting search terms as exact+phrase keywords
//   - move bids toward a 30% ACOS target (capped ±25%/run, so safe to repeat)
// ?dryRun=1 previews without applying. Auth: Bearer CRON_SECRET (Vercel injects it).
// Emails a summary only when it took an action or hit an error (keeps the inbox quiet).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runAdEngine({ dryRun });

  // ROUTINE RUNS ARE SILENT. William 2026-08-27: "telegram it is please i dont want to fill the
  // inbox". At hourly, across three countries, a mail per acting run is up to 72 a day. The
  // hourly watchdog reports what the engine did; this route now speaks up only when it BROKE.
  //
  // Errors still mail, because a run that threw is the one case where staying quiet is
  // indistinguishable from a run that never happened.
  if (!dryRun && result.errors.length) {
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] Ad engine ran with errors`, text: summarizeAdEngine(result) })
      .catch((e) => console.error("[ad-engine] email failed:", e));
  }

  return NextResponse.json(result);
}
