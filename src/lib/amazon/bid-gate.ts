// The approval gates — asking William, and remembering what he said.
//
// William 2026-08-13 set out the staircase and the conversation at each landing:
//
//   "all the way up to 85 cents ... And then we see where we're at. Then you ping me, then you
//    message me, and you let me on telegram or email ... you say, hey, these words are at 85 cents,
//    they have this many impressions, they have this many clicks. Do you want to raise the bid past
//    85 cents and continue to do another 10 cents every six hours to $1[.85] ... Then you'll ping
//    me again and say, at 185, these words have spent this much, they have this much impressions,
//    they have this many clicks. Do you want to raise them to 285"
//
// Two halves, and until now neither existed. planBids() produces `escalated` with the evidence
// attached, and nothing ever sent it anywhere. And when he answers "yes, go to $1.85", there was
// nowhere to put that answer, so the next run would stop at $0.85 and ask again forever.
//
// WHY THE PING IS NOT SENT EVERY RUN. The engine reports a standing ask in its own output every
// time, deliberately, so it cannot go quiet. A Telegram push is different: the same message four
// times a day trains you to ignore it, and an ignored alert is worse than none. So a gate notifies
// ONCE per (entity, gate) and then goes quiet, while the ask stays visible in the daily digest
// until it is answered.
import { db } from "@/lib/db/client";
import { LADDER_GATES, nextGate, type BidEscalation } from "./ad-rules";

export async function ensureBidGate(): Promise<void> {
  await db().execute(`
    CREATE TABLE IF NOT EXISTS bid_ceiling_approval (
      entity_id    TEXT NOT NULL,
      ad_product   TEXT NOT NULL,
      ceiling      REAL NOT NULL,          -- the highest bid this entity is allowed to climb to
      approved_by  TEXT,
      approved_at  TEXT NOT NULL,
      note         TEXT,
      PRIMARY KEY (entity_id, ad_product)
    )`);
  await db().execute(`
    CREATE TABLE IF NOT EXISTS bid_gate_notice (
      entity_id    TEXT NOT NULL,
      ad_product   TEXT NOT NULL,
      gate         REAL NOT NULL,          -- the ceiling it was sitting at when we asked
      asked_at     TEXT NOT NULL,
      answered_at  TEXT,
      PRIMARY KEY (entity_id, ad_product, gate)
    )`);
}

/** Every ceiling a human has granted, keyed by entity id, for one ad product. */
export async function approvedCeilings(adProduct: string): Promise<Map<string, number>> {
  await ensureBidGate();
  const r = await db().execute({
    sql: `SELECT entity_id, ceiling FROM bid_ceiling_approval WHERE ad_product = ?`,
    args: [adProduct],
  });
  return new Map(r.rows.map((x) => [String(x.entity_id), Number(x.ceiling)]));
}

/**
 * Record that William has allowed an entity past its current gate.
 *
 * Only ever moves a ceiling UP, and only to a real gate. A typo cannot silently lower a ceiling
 * that was already granted, and nothing can invent a ceiling between the gates he named.
 */
export async function approveCeiling(
  entityId: string, adProduct: string, ceiling: number, note?: string, at = new Date().toISOString(),
): Promise<{ ok: boolean; ceiling: number; reason?: string }> {
  await ensureBidGate();
  const gate = LADDER_GATES.find((g) => Math.round(g * 100) === Math.round(ceiling * 100));
  if (gate === undefined) {
    return { ok: false, ceiling, reason: `$${ceiling.toFixed(2)} is not one of the gates (${LADDER_GATES.map((g) => "$" + g.toFixed(2)).join(", ")})` };
  }
  const cur = await db().execute({
    sql: `SELECT ceiling FROM bid_ceiling_approval WHERE entity_id = ? AND ad_product = ?`,
    args: [entityId, adProduct],
  });
  const existing = cur.rows[0] ? Number(cur.rows[0].ceiling) : 0;
  if (existing >= gate) return { ok: true, ceiling: existing, reason: "already approved at or above that gate" };
  await db().execute({
    sql: `INSERT INTO bid_ceiling_approval (entity_id, ad_product, ceiling, approved_by, approved_at, note)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(entity_id, ad_product) DO UPDATE SET ceiling=excluded.ceiling,
            approved_at=excluded.approved_at, note=excluded.note`,
    args: [entityId, adProduct, gate, "William", at, note ?? null],
  });
  await db().execute({
    sql: `UPDATE bid_gate_notice SET answered_at = ? WHERE entity_id = ? AND ad_product = ? AND answered_at IS NULL`,
    args: [at, entityId, adProduct],
  });
  return { ok: true, ceiling: gate };
}

/** Which of these escalations have not been put to William yet. */
export async function unaskedGates(adProduct: string, escalated: BidEscalation[]): Promise<BidEscalation[]> {
  if (!escalated.length) return [];
  await ensureBidGate();
  const r = await db().execute({
    sql: `SELECT entity_id, gate FROM bid_gate_notice WHERE ad_product = ?`,
    args: [adProduct],
  });
  const asked = new Set(r.rows.map((x) => `${x.entity_id}|${Math.round(Number(x.gate) * 100)}`));
  return escalated.filter((e) => !asked.has(`${e.id}|${Math.round(e.bid * 100)}`));
}

export async function markAsked(adProduct: string, escalated: BidEscalation[], at = new Date().toISOString()): Promise<void> {
  for (const e of escalated) {
    await db().execute({
      sql: `INSERT OR IGNORE INTO bid_gate_notice (entity_id, ad_product, gate, asked_at) VALUES (?,?,?,?)`,
      args: [e.id, adProduct, e.bid, at],
    });
  }
}

/**
 * The message itself, in the shape William asked for: what they are at, what the money bought, and
 * the specific question with the specific next number in it.
 */
export function formatGateAsk(adProduct: string, escalated: BidEscalation[]): string {
  if (!escalated.length) return "";
  const product = adProduct.replace("SPONSORED_", "Sponsored ").toLowerCase()
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  const byGate = new Map<number, BidEscalation[]>();
  for (const e of escalated) {
    const g = Math.round(e.bid * 100) / 100;
    if (!byGate.has(g)) byGate.set(g, []);
    byGate.get(g)!.push(e);
  }
  const L: string[] = [];
  for (const [gate, rows] of [...byGate.entries()].sort((a, b) => a[0] - b[0])) {
    const to = nextGate(gate);
    L.push(`${rows.length} ${product} keyword${rows.length === 1 ? "" : "s"} are at $${gate.toFixed(2)} and still not spending.`);
    L.push("");
    for (const e of rows.slice(0, 15)) {
      L.push(`  ${e.label}`);
      L.push(`    ${e.impressions.toLocaleString()} impressions, ${e.clicks} clicks, $${e.spend.toFixed(2)} spent`);
    }
    if (rows.length > 15) L.push(`  ...and ${rows.length - 15} more`);
    L.push("");
    if (to === null) {
      L.push(`They are at the top gate. There is no higher step without a new decision from you.`);
    } else {
      const runs = Math.round((to - gate) / 0.10);
      L.push(`Do you want to raise them past $${gate.toFixed(2)}, another 10 cents every six hours up to $${to.toFixed(2)}?`);
      L.push(`That is ${runs} runs, about ${(runs * 6 / 24).toFixed(1)} days. Reply yes and I will set the ceiling to $${to.toFixed(2)}.`);
    }
    L.push("");
  }
  return L.join("\n").trimEnd();
}
