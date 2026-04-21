import { NextResponse } from "next/server";
import { syncInventory } from "@/lib/amazon/sync-inventory";
import { syncRestockRecommendations } from "@/lib/amazon/sync-restock";
import { sendEmail, alertRecipient } from "@/lib/email";

// Vercel Cron invokes this once a day. The CRON_SECRET header is injected
// automatically by Vercel; reject anything else.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds — restock report polling can take 3-5 min

async function sendAudit(subject: string, text: string): Promise<void> {
  try {
    await sendEmail({ to: alertRecipient(), subject: `[PA-AMZN audit] ${subject}`, text });
  } catch (err) {
    console.error("[cron] audit email failed:", err);
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const failures: string[] = [];

  // 1. FBA inventory quantities
  const inv = await syncInventory();
  if (!inv.ok) {
    failures.push(`Inventory sync failed: ${inv.error ?? inv.reason ?? "unknown"}`);
  }

  // 2. Amazon restock recommendations (updates Amazon's suggested quantities
  //    in the inventory table; serves as the source of truth for thresholds).
  const restock = await syncRestockRecommendations();
  if (!restock.ok) {
    failures.push(`Restock recommendations sync failed: ${restock.error ?? restock.reason ?? "unknown"}`);
  }

  // Inventory sync already runs runLowStockAlerts internally on success, so
  // that piece is covered.

  if (failures.length > 0) {
    const body = [
      `Daily sync had ${failures.length} failure${failures.length === 1 ? "" : "s"} at ${startedAt}:`,
      "",
      ...failures.map((f, i) => `${i + 1}. ${f}`),
      "",
      `Inventory sync: ${inv.ok ? "OK" : "FAILED"} (${inv.count} SKUs, ${inv.durationMs}ms)`,
      `Restock sync: ${restock.ok ? "OK" : "FAILED"} (${restock.count} recs, ${restock.durationMs}ms)`,
      "",
      `Amazon threshold sync did not complete successfully. Investigate credentials, Amazon API status, or rate limits.`,
    ].join("\n");
    await sendAudit("Daily sync failure", body);
  }

  return NextResponse.json({
    startedAt,
    finishedAt: new Date().toISOString(),
    inventory: { ok: inv.ok, count: inv.count, durationMs: inv.durationMs, error: inv.error ?? inv.reason },
    restock: { ok: restock.ok, count: restock.count, durationMs: restock.durationMs, error: restock.error ?? restock.reason },
    failures,
  });
}
