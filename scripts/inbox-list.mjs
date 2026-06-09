/**
 * List the current hello@ inbox (after cleanup) with read/unread + a category
 * guess, so we can see what needs a reply and design labels. Read-only.
 * RUN: node scripts/inbox-list.mjs
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const api=(p)=>fetch(`https://gmail.googleapis.com/gmail/v1/users/me${p}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
const header=(m,n)=>m.payload?.headers?.find(h=>h.name.toLowerCase()===n)?.value||'';
const emailOf=(f)=>(f.match(/<([^>]+)>/)?.[1]||f).trim().toLowerCase();

function category(from, subject){
  const f=from.toLowerCase(), s=subject.toLowerCase();
  if(/flippa\.com/.test(f)) return 'Flippa (company sale)';
  if(/dev-reg-vetting@amazon|amzn-clicks|advertising-api|ads\.amazon/.test(f)||/api (registration|access|request)/.test(s)) return 'Amazon Ads API';
  if(/marketplace\.amazon|a message from|buyer|return request|customer/.test(f+s)) return 'Customer / buyer';
  if(/fbareviews/.test(f)) return 'Reviews / content';
  if(/payment|invoice|refund|tax|nfe|payout|disburse/.test(s)) return 'Finance';
  if(/seller-?performance|account health|policy|suspend|verif|deactivat/.test(f+s)) return 'Account health';
  return 'Other / review';
}

const ids=[]; let pageToken;
do{const q=new URLSearchParams({q:'in:inbox',maxResults:'200'});if(pageToken)q.set('pageToken',pageToken);const page=await api(`/messages?${q}`);(page.messages||[]).forEach(m=>ids.push(m.id));pageToken=page.nextPageToken;}while(pageToken);
console.log(`Inbox: ${ids.length} messages\n`);
const rows=[];
for(const {id} of ids){const m=await api(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);rows.push({from:emailOf(header(m,'from')),subject:header(m,'subject'),unread:(m.labelIds||[]).includes('UNREAD')});}
rows.sort((a,b)=> (a.unread===b.unread?0:a.unread?-1:1) );
const byCat={};
for(const r of rows){const c=category(r.from,r.subject);(byCat[c]=byCat[c]||[]).push(r);}
for(const [cat,list] of Object.entries(byCat)){
  console.log(`\n### ${cat} (${list.length})`);
  for(const r of list) console.log(`  ${r.unread?'● UNREAD':'  read  '}  ${r.from.padEnd(34).slice(0,34)}  ${r.subject.slice(0,60)}`);
}
const unread=rows.filter(r=>r.unread).length;
console.log(`\n${unread} unread (likely need attention), ${rows.length-unread} read (likely handled).`);
