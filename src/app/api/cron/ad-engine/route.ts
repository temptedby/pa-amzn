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

  const acted = result.killed.length + result.bids.length + result.added.length > 0;
  if (!dryRun && (acted || result.errors.length)) {
    const subject = result.errors.length
      ? "Ad engine ran with errors"
      : `Ad engine: ${result.killed.length} paused, ${result.added.length} added, ${result.bids.length} re-bid`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] ${subject}`, text: summarizeAdEngine(result) })
      .catch((e) => console.error("[ad-engine] email failed:", e));
  }

  return NextResponse.json(result);
}
