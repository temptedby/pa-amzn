/** Trash (reversible 30d) the not-needed inbox noise: our own scheduled [PA-AMZN] emails +
 *  cold third-party marketing. KEEPS Amazon account, customer, named reps, financial, personal.
 *  RUN: node scripts/inbox-trash.mjs        (preview)
 *       MODE=trash node scripts/inbox-trash.mjs  (apply) */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const LIVE=process.env.MODE==='trash';
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const G='https://gmail.googleapis.com/gmail/v1/users/me', H={Authorization:`Bearer ${tok}`};

// trash these (cold marketing + our own scheduled). NOT fbareviews (possible paid service — left for review).
const TRASH_FROM=/(alerts@phoneassured\.com|@shop\.tiktok\.com|alibaba\.com|googleads-noreply@google\.com|@shopkeeper\.com|marketing@flippa\.com)/i;
const TRASH_SUBJECT=/^\s*\[PA-AMZN/i;
// never trash, even if a rule above matches:
const PROTECT=/(@marketplace\.amazon\.com|donotreply@amazon|@amazon\.ca|seller-?central|account health|identity|verif|@plaid\.com|dealdesk@flippa|support@flippa|@besocialscene\.com|cindyrlaff|dev-reg-vetting|atlassian)/i;

let ids=[],pt;
do{const u=new URL(`${G}/messages`);u.searchParams.set('q','in:inbox');u.searchParams.set('maxResults','100');if(pt)u.searchParams.set('pageToken',pt);const r=await fetch(u,{headers:H}).then(r=>r.json());(r.messages||[]).forEach(m=>ids.push(m.id));pt=r.nextPageToken;}while(pt);

const trash=[],keep=[];
for(const id of ids){
  const r=await fetch(`${G}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,{headers:H}).then(r=>r.json());
  const h=Object.fromEntries((r.payload?.headers||[]).map(x=>[x.name.toLowerCase(),x.value]));
  const m={id,from:h.from||'',subject:h.subject||''};
  if(!PROTECT.test(m.from+m.subject) && (TRASH_FROM.test(m.from)||TRASH_SUBJECT.test(m.subject))) trash.push(m); else keep.push(m);
}
console.log(`inbox ${ids.length} | trash ${trash.length} | keep ${keep.length}\n`);
console.log('=== TRASH ==='); trash.forEach(m=>console.log(`  ${m.from.slice(0,38).padEnd(38)} | ${m.subject.slice(0,52)}`));
if(LIVE){let n=0;for(const m of trash){const r=await fetch(`${G}/messages/${m.id}/trash`,{method:'POST',headers:H});if(r.ok)n++;}console.log(`\ntrashed ${n}/${trash.length} (recoverable in Gmail Trash 30 days)`);}
else console.log('\n(preview — MODE=trash to apply)');
