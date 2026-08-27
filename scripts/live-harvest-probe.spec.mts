import { it, expect } from "vitest";
import fs from "node:fs"; import zlib from "node:zlib";
import { harvestCandidates, harvestWindows } from "../src/lib/amazon/ad-engine";

const OUT = process.env.PROBE_OUT || "/tmp/harvest-probe.txt";
const L = (s: string) => fs.appendFileSync(OUT, s + "\n");

const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];})) as Record<string,string>;
const {ADS_CLIENT_ID:CID,ADS_CLIENT_SECRET:CS,ADS_REFRESH_TOKEN:RT,ADS_PROFILE_ID:PROF}=env;

it("what the harvest would add today", async () => {
  fs.writeFileSync(OUT, "");
  const at = (await (await fetch("https://api.amazon.com/auth/o2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:RT,client_id:CID,client_secret:CS})})).json()).access_token;
  const H = {"Amazon-Advertising-API-ClientId":CID,"Amazon-Advertising-API-Scope":PROF,Authorization:`Bearer ${at}`};
  const RH = {...H,"Content-Type":"application/vnd.createasyncreportrequest.v3+json"};
  const COLS=["searchTerm","keyword","matchType","adGroupId","campaignId","cost","clicks","purchases14d","sales14d"];
  const wins = harvestWindows(60, Date.now());
  L(`harvest windows: ${JSON.stringify(wins)}`);
  const rows:any[]=[];
  for (const [a,b] of wins){
    const body={name:`probe2-${a}`,startDate:a,endDate:b,configuration:{adProduct:"SPONSORED_PRODUCTS",groupBy:["searchTerm"],columns:COLS,reportTypeId:"spSearchTerm",timeUnit:"SUMMARY",format:"GZIP_JSON"}};
    const r=await fetch("https://advertising-api.amazon.com/reporting/reports",{method:"POST",headers:RH,body:JSON.stringify(body)});
    const t=await r.text(); const id = r.status===425 ? t.match(/[0-9a-f-]{36}/)![0] : JSON.parse(t).reportId;
    L(`  window ${a}..${b} report ${id} (${r.status})`);
    for(let i=0;i<60;i++){
      const s=await (await fetch(`https://advertising-api.amazon.com/reporting/reports/${id}`,{headers:{...H,"Content-Type":"application/json"}})).json();
      if(s.status==="COMPLETED"){ const got=JSON.parse(zlib.gunzipSync(Buffer.from(await (await fetch(s.url)).arrayBuffer())).toString()); rows.push(...got); L(`    ${got.length} rows`); break; }
      if(s.status==="FAILURE"){ L("    FAILED"); break; }
      await new Promise(z=>setTimeout(z,10000));
    }
  }
  L(`\ntotal search-term rows: ${rows.length}`);
  const mt:Record<string,number>={}; for(const r of rows) mt[r.matchType||"(none)"]=(mt[r.matchType||"(none)"]||0)+1;
  L(`rows by source match type: ${JSON.stringify(mt)}`);

  const agg=new Map<string,any>();
  for(const r of rows){ const k=(r.searchTerm||"").toLowerCase(); if(!k) continue;
    const o=agg.get(k)??{term:r.searchTerm,cost:0,sales:0,ord:0,src:new Set<string>()};
    o.cost+=r.cost||0; o.sales+=r.sales14d||0; o.ord+=r.purchases14d||0; o.src.add(r.matchType||"(none)"); agg.set(k,o); }
  const winners=[...agg.values()].filter(o=>o.ord>0 && o.sales>=2*o.cost).sort((a,b)=>(b.sales/b.cost)-(a.sales/a.cost));
  L(`\n=== CONVERTING TERMS AT >=2x IN THE 60d WINDOW: ${winners.length} ===`);
  for(const o of winners) L(`  $${o.cost.toFixed(2).padStart(6)} -> $${o.sales.toFixed(2).padStart(7)}  ${(o.sales/o.cost).toFixed(1)}x  ${o.ord}ord  src=[${[...o.src].join("/")}]  ${o.term}`);
  const broad=winners.filter(o=>o.src.has("BROAD"));
  L(`\n  BROAD-sourced (allowed by today's rule): ${broad.length}`);
  L(`  NOT broad-sourced (blocked today): ${winners.length-broad.length}`);
  for(const o of winners.filter(o=>!o.src.has("BROAD"))) L(`    blocked: ${o.term}  src=[${[...o.src].join("/")}]`);

  const adds = harvestCandidates(rows as any, new Set());
  L(`\n=== harvestCandidates() with EMPTY existing-set returns ${adds.length} ops ===`);
  const uniq=[...new Set(adds.map(a=>a.keywordText.toLowerCase()))];
  L(`  distinct terms it wants: ${uniq.length}`);
  for(const u of uniq) L(`    ${u}`);
  expect(rows.length).toBeGreaterThan(0);
}, 1200000);
