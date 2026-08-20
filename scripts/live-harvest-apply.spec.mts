/** LIVE: apply the harvest under the "any converting source" rule (PR #8), William 2026-08-20.
 *
 *  Uses the REAL harvestCandidates() so what lands is what the engine itself would do once #8 is
 *  deployed. Reads the search-term rows the engine already collected today rather than re-queueing
 *  a report, because 12-13Z reports have measured 28-31 minutes.
 *
 *  DRY RUN unless APPLY=1. Every created keyword is read back from Amazon before it is reported.
 *  RUN: npx vitest run scripts/live-harvest-apply.spec.mts --config vitest.live.config.ts --testTimeout=900000
 */
import { it, expect } from "vitest";
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { harvestCandidates } from "../src/lib/amazon/ad-engine";

const OUT = process.env.PROBE_OUT || "/tmp/harvest-apply.txt";
const L = (s: string) => { fs.appendFileSync(OUT, s + "\n"); console.log(s); };
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
) as Record<string, string>;
const { ADS_CLIENT_ID: CID, ADS_CLIENT_SECRET: CS, ADS_REFRESH_TOKEN: RT, ADS_PROFILE_ID: PROF } = env;
const A = "https://advertising-api.amazon.com";
const KW_CT = "application/vnd.spKeyword.v3+json";

it("harvest any converting term and apply", async () => {
  fs.writeFileSync(OUT, "");
  const at = (await (await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: RT, client_id: CID, client_secret: CS }),
  })).json()).access_token;
  const H = (ct = KW_CT) => ({
    "Amazon-Advertising-API-ClientId": CID, "Amazon-Advertising-API-Scope": PROF,
    Authorization: `Bearer ${at}`, "Content-Type": ct, Accept: ct,
  });

  // 1. the search-term rows the engine collected this morning
  const db = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
  const rows: any[] = [];
  for (const purpose of ["engine-harvest-0", "engine-harvest-1"]) {
    const j = await db.execute({
      sql: "SELECT rows_json, collected_at FROM ads_report_jobs WHERE purpose = ? AND rows_json IS NOT NULL ORDER BY collected_at DESC LIMIT 1",
      args: [purpose],
    });
    const got = JSON.parse(String(j.rows[0].rows_json));
    L(`${purpose}: ${got.length} rows, collected ${String(j.rows[0].collected_at).slice(0, 16)}`);
    rows.push(...got);
  }

  // 2. every keyword in the account, ANY state, so an archived duplicate is never re-submitted
  const kws: any[] = [];
  let next: string | undefined;
  do {
    const r = await (await fetch(`${A}/sp/keywords/list`, {
      method: "POST", headers: H(), body: JSON.stringify({ maxResults: 1000, ...(next ? { nextToken: next } : {}) }),
    })).json();
    (r.keywords ?? []).forEach((k: any) => kws.push(k));
    next = r.nextToken;
  } while (next);
  const existing = new Set(kws.map((k) => `${k.adGroupId}|${k.matchType}|${(k.keywordText || "").toLowerCase().trim()}`));
  L(`account keywords: ${kws.length}`);

  // 3. the real selector, with PR #8's rule
  const anySource = ["BROAD", "PHRASE", "EXACT"];
  const before = harvestCandidates(rows, existing);
  const adds = harvestCandidates(rows, existing, undefined, { discoveryMatchTypes: anySource });
  L(`\nbroad-only rule (production today): ${before.length} ops`);
  L(`any-source rule (PR #8):            ${adds.length} ops\n`);
  adds.forEach((a, i) => L(`  ${String(i + 1).padStart(2)}. ${a.matchType.padEnd(6)} $${a.bid}  adGroup ${a.adGroupId}  "${a.keywordText}"`));

  if (process.env.APPLY !== "1") { L("\nDRY RUN — set APPLY=1 to submit"); expect(adds.length).toBeGreaterThan(0); return; }

  // 4. submit, then read back. Nothing is reported as added until Amazon returns it.
  const res = await fetch(`${A}/sp/keywords`, { method: "POST", headers: H(), body: JSON.stringify({ keywords: adds }) });
  const body = await res.json();
  L(`\nPOST /sp/keywords -> HTTP ${res.status}`);
  const success = (body?.keywords?.success ?? []) as any[];
  const error = (body?.keywords?.error ?? []) as any[];
  L(`  success ${success.length}, error ${error.length}`);
  error.forEach((e) => L(`  REJECTED idx ${e.index}: ${JSON.stringify(e.errors ?? e).slice(0, 200)}`));

  const newIds = success.map((s) => String(s.keywordId)).filter(Boolean);
  if (newIds.length) {
    const back = await (await fetch(`${A}/sp/keywords/list`, {
      method: "POST", headers: H(),
      body: JSON.stringify({ keywordIdFilter: { include: newIds }, includeExtendedDataFields: true, maxResults: 100 }),
    })).json();
    L(`\n=== READ BACK FROM AMAZON: ${(back.keywords ?? []).length} of ${newIds.length} ===`);
    (back.keywords ?? []).forEach((k: any) =>
      L(`  ${k.state.padEnd(8)} ${k.matchType.padEnd(6)} $${k.bid}  created ${String(k.extendedData?.creationDateTime || "?").slice(0, 16)}  "${k.keywordText}"`));
  }
  expect(res.status).toBeLessThan(300);
}, 900000);
