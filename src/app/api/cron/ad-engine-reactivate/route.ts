import { NextResponse } from "next/server";
import { runMonthlyReactivation, summarizeReactivation } from "@/lib/amazon/ad-engine";
import { runSbReactivation, summarizeSbReactivation } from "@/lib/amazon/sb-engine";
import { sendEmail, alertRecipient } from "@/lib/email";

// Monthly keyword REACTIVATION job (ad-engine-harvest-rule.md step 4, William 2026-06-26).
// Vercel Cron invokes this once a month (see vercel.json). It re-enables any PAUSED keyword
// whose trailing 65 days recovered to the winner bar (>= $4 spend AND ACOS <= 50% / ROAS >= 2x),
// so a keyword the 6h kill-switch paused but that has since converted profitably comes back.
// Sponsored Brands rides the same job (William 2026-08-07: "we reset it next month and turn it back
// on next month if it has lifetime success"), but judges LIFETIME record rather than a trailing
// window, because Amazon retains only 60 days of Sponsored Brands data and a killed word would look
// untested again by month four.
// ?dryRun=1 previews without applying. Auth: Bearer CRON_SECRET (Vercel injects it).
// Emails a summary only when it re-enabled something or hit an error (keeps the inbox quiet).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runMonthlyReactivation({ dryRun });
  // Sponsored Brands is run even if Sponsored Products threw: one channel's report queue stalling
  // must not hold the other channel's winners switched off for another month.
  const sb = await runSbReactivation({ dryRun }).catch((e) => {
    console.error("[ad-engine-reactivate] sb failed:", e);
    return null;
  });

  const acted = result.reactivated.length + (sb?.reactivated.length ?? 0) > 0;
  const failed = result.errors.length + (sb?.errors.length ?? 0) > 0;
  if (!dryRun && (acted || failed)) {
    const n = result.reactivated.length + (sb?.reactivated.length ?? 0);
    const subject = failed ? "Monthly reactivation ran with errors" : `Monthly reactivation: ${n} keywords re-enabled`;
    const text = [summarizeReactivation(result), sb ? summarizeSbReactivation(sb) : "Sponsored Brands reactivation failed to run."].join("\n\n");
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN ads] ${subject}`, text })
      .catch((e) => console.error("[ad-engine-reactivate] email failed:", e));
  }

  return NextResponse.json({ ...result, sponsoredBrands: sb });
}
