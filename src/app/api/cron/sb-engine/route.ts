import { NextResponse } from "next/server";
import { runSbEngine, summarizeSbEngine } from "@/lib/amazon/sb-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// Autonomous Sponsored Brands kill. Separate from the Sponsored Products engine on purpose: the
// legacy v2 reports this depends on take about a minute PER DAY of data, so sharing one 300s budget
// with the SP engine's report handling would have starved both.
//
// One rule, William's: a word past $4 month-to-date with no sale, or losing money on the sales it
// has, gets switched off. It is judged per WORD across every copy, and it reverses on the 1st of the
// month via ad-engine-reactivate.
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
  const result = await runSbEngine({ dryRun });

  if (!dryRun && (result.killed.length || result.errors.length)) {
    const subject = result.errors.length
      ? "SB engine ran with errors"
      : `SB engine: ${result.killed.length} word(s) paused`;
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] ${subject}`, text: summarizeSbEngine(result) })
      .catch((e) => console.error("[sb-engine] email failed:", e));
  }

  return NextResponse.json(result);
}
