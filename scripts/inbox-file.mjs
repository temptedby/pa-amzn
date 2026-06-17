/** Sort + file the hello@ inbox: apply a category label to each message, archive the purely
 *  informational ones (out of inbox, into their label), keep action-required in the inbox, and
 *  print the open ISSUES / action items. Reversible (archive = remove INBOX label; mail kept).
 *  RUN: node scripts/inbox-file.mjs        (preview)
 *       MODE=file node scripts/inbox-file.mjs   (apply) */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {GMAIL_CLIENT_ID:CID,GMAIL_CLIENT_SECRET:CS,GMAIL_REFRESH_TOKEN:RT}=process.env;
const LIVE=process.env.MODE==='file';
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CID,client_secret:CS,refresh_token:RT,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const G='https://gmail.googleapis.com/gmail/v1/users/me', H={Authorization:`Bearer ${tok}`,'Content-Type':'application/json'};

// ensure labels exist -> id map
const ex=await fetch(`${G}/labels`,{headers:H}).then(r=>r.json());
const labelId={}; (ex.labels||[]).forEach(l=>labelId[l.name]=l.id);
async function ensure(name){ if(labelId[name])return labelId[name]; const r=await fetch(`${G}/labels`,{method:'POST',headers:H,body:JSON.stringify({name,labelListVisibility:'labelShow',messageListVisibility:'show'})}).then(r=>r.json()); labelId[name]=r.id; return r.id; }

// classify: [label, archive?, isIssue, issueNote]
function classify(from,subject){
  const f=from.toLowerCase(), s=subject.toLowerCase(), t=f+' '+s;
  if(/marketplace\.amazon\.com/.test(f)) return ['PA/Customers',false,true,'Buyer message — review/reply'];
  if(/identity|verif|deactivat|reactivat|account health|suspend|appeal/.test(t)) return ['PA/Amazon-Action',false,true,'Amazon account action'];
  if(/listing hidden|action required/.test(s)&&/flippa/.test(f)) return ['PA/Flippa-Sale',false,true,'Flippa listing action required'];
  if(/@flippa\.com/.test(f)&&!/marketing@|no-?reply/.test(f)) return ['PA/Flippa-Sale',false,true,'Flippa rep re: business sale'];
  if(/@plaid\.com/.test(f)) return ['PA/Financial',false,true,'Plaid use-case call — schedule/respond'];
  if(/pnc|taxdome|amex|american express|bank|intuit|quickbook/.test(f)) return ['PA/Financial',false,false,''];
  if(/cindyrlaff|prep|shipment/.test(t)) return ['PA/Shipments',false,true,'Shipment coordination (Cynthia)'];
  if(/jira@amzn-clicks|atlassian|dev-reg-vetting/.test(f)) return ['PA/Amazon-Account',false,false,''];
  if(/donotreply@amazon|seller central/.test(f)) return ['PA/Amazon-Account',true,false,'']; // shipped/refund/payment = informational -> archive
  if(/fbareviews|shopkeeper|@email\.|marketing@|newsletter/.test(f)) return ['PA/Marketing',true,false,''];
  if(/besocialscene/.test(f)) return ['PA/FromWilliam',false,false,''];
  return ['PA/Other',false,false,''];
}

let ids=[],pt;
do{const u=new URL(`${G}/messages`);u.searchParams.set('q','in:inbox');u.searchParams.set('maxResults','100');if(pt)u.searchParams.set('pageToken',pt);const r=await fetch(u,{headers:H}).then(r=>r.json());(r.messages||[]).forEach(m=>ids.push(m.id));pt=r.nextPageToken;}while(pt);

const plan=[], issues=[];
for(const id of ids){
  const r=await fetch(`${G}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,{headers:H}).then(r=>r.json());
  const h=Object.fromEntries((r.payload?.headers||[]).map(x=>[x.name.toLowerCase(),x.value]));
  const [label,archive,isIssue,note]=classify(h.from||'',h.subject||'');
  plan.push({id,from:(h.from||'').slice(0,34),subject:(h.subject||'').slice(0,46),label,archive});
  if(isIssue) issues.push({from:(h.from||'').replace(/<.*/,'').slice(0,28),subject:(h.subject||'').slice(0,52),note});
}
const byLabel=plan.reduce((o,m)=>((o[m.label]=(o[m.label]||0)+1),o),{});
console.log('inbox',ids.length,'\n=== filing plan (label / archive) ==='); console.log(byLabel);
console.log('archive (out of inbox):',plan.filter(m=>m.archive).length,' | keep in inbox:',plan.filter(m=>!m.archive).length);
console.log('\n=== OPEN ISSUES / ACTION ITEMS ('+issues.length+') ===');
issues.forEach(i=>console.log(`  • [${i.note}] ${i.from} — ${i.subject}`));

if(LIVE){
  for(const m of plan){
    const lid=await ensure(m.label);
    const body={addLabelIds:[lid],...(m.archive?{removeLabelIds:['INBOX']}:{})};
    await fetch(`${G}/messages/${m.id}/modify`,{method:'POST',headers:H,body:JSON.stringify(body)});
  }
  console.log('\nFILED: labels applied; informational mail archived. Action items kept in inbox.');
} else console.log('\n(preview — MODE=file to apply)');
