// Audit: every search term that CONVERTED in the last 90 days must exist as an ENABLED
// keyword with a bid that can actually win impressions. Requests reports via the deferred
// job table (create now, collect on a later pass) so it never blocks on Amazon's ~9min queue.
import { createClient } from "@libsql/client";
import { gunzipSync } from "node:zlib";
import fs from "node:fs";

const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^["']|["']$/g,"")]));
const db = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
const BASE = "https://advertising-api.amazon.com";
const RPT_CT = "application/vnd.createasyncreportrequest.v3+json";
const iso = d => d.toISOString().slice(0,10);
const day = n => new Date(Date.now() - n*86400000);

const tok = await (async () => {
  const r = await fetch("https://api.amazon.com/auth/o2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:env.ADS_REFRESH_TOKEN,client_id:env.ADS_CLIENT_ID,client_secret:env.ADS_CLIENT_SECRET})});
  const j = await r.json(); if(!j.access_token) throw new Error("token "+JSON.stringify(j).slice(0,200)); return j.access_token;
})();
const H = (ct="application/json") => ({Authorization:`Bearer ${tok}`,"Amazon-Advertising-API-ClientId":env.ADS_CLIENT_ID,"Amazon-Advertising-API-Scope":env.ADS_PROFILE_ID,"Content-Type":ct,Accept:ct});

// --- deferred report helper (mirrors src/lib/amazon/ads-reports.ts) ---
async function job(purpose, startDate, endDate, reportTypeId, groupBy, columns) {
  const key = `${purpose}|${startDate}|${endDate}`;
  const row = (await db.execute({sql:"select * from ads_report_jobs where key=?",args:[key]})).rows[0];
  if (row?.status === "COMPLETED" && row.rows_json) return { ready:true, key, rows: JSON.parse(row.rows_json) };
  if (row?.report_id) {
    const s = await (await fetch(`${BASE}/reporting/reports/${row.report_id}`,{headers:H(RPT_CT)})).json();
    if (s.status === "COMPLETED" && s.url) {
      const raw = JSON.parse(gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString());
      await db.execute({sql:"update ads_report_jobs set status='COMPLETED', collected_at=?, rows_json=? where key=?",args:[new Date().toISOString(), JSON.stringify(raw), key]});
      return { ready:true, key, rows: raw };
    }
    return { ready:false, key, status: s.status || "PENDING" };
  }
  const body = { name: purpose, startDate, endDate, configuration:{ adProduct:"SPONSORED_PRODUCTS", groupBy:[groupBy], columns, reportTypeId, timeUnit:"SUMMARY", format:"GZIP_JSON" } };
  const cr = await (await fetch(`${BASE}/reporting/reports`,{method:"POST",headers:H(RPT_CT),body:JSON.stringify(body)})).json();
  let rid = cr.reportId;
  if (!rid && cr.code === "425") rid = String(cr.detail||"").match(/([0-9a-f-]{36})/)?.[1];
  if (!rid) return { ready:false, key, status:"CREATE_FAILED", err: JSON.stringify(cr).slice(0,200) };
  await db.execute({sql:"insert or replace into ads_report_jobs (key,purpose,report_id,status,requested_at) values (?,?,?,'PENDING',?)",args:[key,purpose,rid,new Date().toISOString()]});
  return { ready:false, key, status:"REQUESTED" };
}

// 90 days in three 30-day windows (Amazon caps a single SP report range at 31 days).
const W = [[90,61],[60,31],[30,1]].map(([a,b]) => [iso(day(a)), iso(day(b))]);
const ST_COLS = ["searchTerm","keyword","keywordId","matchType","clicks","cost","purchases14d","sales14d","campaignId","adGroupId"];
const parts = [];
for (let i=0;i<W.length;i++) parts.push(await job(`cta-st-${i}`, W[i][0], W[i][1], "spSearchTerm", "searchTerm", ST_COLS));
parts.forEach((p,i)=>console.log(`window ${W[i][0]}..${W[i][1]}  ${p.ready?`READY rows=${p.rows.length}`:p.status}${p.err?" "+p.err:""}`));
if (!parts.every(p=>p.ready)) { console.log("\nNOT ALL READY — reports requested; re-run in ~10 min to collect."); process.exit(0); }

// --- converting terms ---
const agg = new Map();
for (const p of parts) for (const r of p.rows) {
  const t = String(r.searchTerm||"").toLowerCase().trim(); if(!t) continue;
  const a = agg.get(t) || {term:t, cost:0, ord:0, sales:0, clicks:0};
  a.cost+=Number(r.cost||0); a.ord+=Number(r.purchases14d||0); a.sales+=Number(r.sales14d||0); a.clicks+=Number(r.clicks||0);
  agg.set(t,a);
}
const conv = [...agg.values()].filter(a=>a.ord>0).sort((a,b)=>b.sales-a.sales);
console.log(`\n=== CONVERTING SEARCH TERMS, last 90d: ${conv.length} (of ${agg.size} terms) ===`);

// --- live keyword inventory ---
const kws = [];
let next;
do {
  const res = await fetch(`${BASE}/sp/keywords/list`,{method:"POST",headers:{...H("application/vnd.spKeyword.v3+json"),"Accept":"application/vnd.spKeyword.v3+json"},body:JSON.stringify({maxResults:1000, ...(next?{nextToken:next}:{})})});
  const j = await res.json();
  if (!res.ok) { console.log("keyword list failed", res.status, JSON.stringify(j).slice(0,200)); break; }
  kws.push(...(j.keywords||[])); next = j.nextToken;
} while (next);
console.log(`live keywords pulled: ${kws.length}`);
const byText = new Map();
for (const k of kws) {
  const t = String(k.keywordText||"").toLowerCase().trim();
  const a = byText.get(t) || []; a.push(k); byText.set(t,a);
}

const CPC_MARKET = 0.59;
const missing=[], paused=[], floored=[], ok=[];
for (const c of conv) {
  const ks = byText.get(c.term) || [];
  const enabled = ks.filter(k=>String(k.state||"").toUpperCase()==="ENABLED");
  if (!ks.length) { missing.push({...c, why:"no keyword exists"}); continue; }
  if (!enabled.length) { paused.push({...c, states:[...new Set(ks.map(k=>k.state))].join("/")}); continue; }
  const maxBid = Math.max(...enabled.map(k=>Number(k.bid||0)));
  if (maxBid < CPC_MARKET*0.6) floored.push({...c, bid:maxBid, matches:enabled.map(k=>k.matchType).join("/")});
  else ok.push({...c, bid:maxBid});
}
const fmt = r => `  $${r.sales.toFixed(2)} sales / ${r.ord} ord / $${r.cost.toFixed(2)} spend${r.bid!=null?` / bid $${r.bid.toFixed(2)}`:""}${r.matches?` [${r.matches}]`:""}${r.states?` [${r.states}]`:""}  ${r.term}`;
console.log(`\n--- NOT LIVE: no keyword exists (${missing.length}) ---`); missing.slice(0,40).forEach(r=>console.log(fmt(r)));
console.log(`\n--- NOT LIVE: keyword exists but PAUSED/ARCHIVED (${paused.length}) ---`); paused.slice(0,40).forEach(r=>console.log(fmt(r)));
console.log(`\n--- LIVE BUT NOT SPENDING: bid under $${(CPC_MARKET*0.6).toFixed(2)} vs $${CPC_MARKET} market CPC (${floored.length}) ---`); floored.slice(0,60).forEach(r=>console.log(fmt(r)));
console.log(`\n--- HEALTHY: enabled and bid competitive (${ok.length}) ---`); ok.slice(0,40).forEach(r=>console.log(fmt(r)));
fs.writeFileSync("/tmp/converting-terms.json", JSON.stringify({missing,paused,floored,ok},null,1));
console.log("\nfull detail -> /tmp/converting-terms.json");
process.exit(0);
