import { NextResponse } from "next/server";
import { runSdEngine, summarizeSdEngine } from "@/lib/amazon/sd-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// Autonomous Sponsored Display kill (William 2026-08-08: "all ads need a $4 kill switch — products
// brands and display"). Display was the last ad product with no rule at all, and the worst
// performer in the account: 0.87x lifetime, returning less than half what it costs.
//
// One rule, the same one Sponsored Products and Sponsored Brands use: a TARGET past $4 month-to-date
// with no sale, or losing money on the sales it has, gets switched off. Every target is judged on
// its own spend — nothing is summed across targets, and pausing one never pauses another.
//
// Runs on its own schedule rather than inside the SP engine because it owns a separate report and
// would otherwise share one 300s budget with Sponsored Products' report handling.
//
// ?dryRun=1 previews without applying. Auth: Bearer CRON_SECRET (Vercel injects it).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runSdEngine({ dryRun });

  if (!dryRun && (result.killed.length || result.errors.length)) {
    const subject = result.errors.length
      ? "SD engine ran with errors"
      : `SD engine: ${result.killed.length} target(s) paused`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] ${subject}`, text: summarizeSdEngine(result) })
      .catch((e) => console.error("[sd-engine] email failed:", e));
  }

  return NextResponse.json(result);
}
