/**
 * Restore every paired campaign to a true 50% of its PRE-CHANGE budget.
 * William 2026-10-27: "make sure you check the budget from 2 weeks ago before all the changes to
 * make sure the budget is the full 50%".
 *
 * The 10-23 script halved October's ACTUAL SPEND ($21.59/day) instead of the budget, so the two
 * shortlist campaigns went from $90 and $250 to $5.40 each. Everything else was halved correctly.
 *
 * The two shortlist campaigns were separate originals, $90 and $250, totalling $340. Setting both
 * to $170 restores that $340 and lands each ASIN side on exactly $283.50, a true half of the
 * $567/day baseline across the paired estate.
 *
 * Dry run by default. --apply writes. Read-back verifies.
 */
import fs from 'node:fs';
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const APPLY=process.argv.includes('--apply');
const CID=process.env.ADS_CLIENT_ID,CS=process.env.ADS_CLIENT_SECRET,RT=process.env.ADS_REFRESH_TOKEN,PROF=process.env.ADS_PROFILE_ID_US||process.env.ADS_PROFILE_ID;
const {access_token}=await (await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS})})).json();
const CT='application/vnd.spCampaign.v3+json';
const H=t=>({Authorization:'Bearer '+access_token,'Amazon-Advertising-API-ClientId':CID,'Amazon-Advertising-API-Scope':PROF,'Content-Type':t,Accept:t});
const list=async()=>(await (await fetch('https://advertising-api.amazon.com/sp/campaigns/list',{method:'POST',headers:H(CT),body:JSON.stringify({maxResults:500,includeExtendedDataFields:true})})).json()).campaigns;
// side, campaignId, the budget BEFORE 2026-10-23, and the target
const SIDE={'28008323784512':'Single','163087560588074':'Single','174896784333516':'Single','254328185654624':'Single','212260116772958':'Single','305834701368758':'Single',
 '260772188956325':'2-Pack','160456263050588':'2-Pack','84702108361350':'2-Pack','21447045572583':'2-Pack','212881454178968':'2-Pack','65188766700280':'2-Pack'};
const WANT={'28008323784512':50,'260772188956325':50,'163087560588074':25,'160456263050588':25,
 '174896784333516':25,'84702108361350':25,'254328185654624':12.5,'21447045572583':12.5,
 '305834701368758':1,'65188766700280':1,'212260116772958':170,'212881454178968':170};
let camps=await list();
const B=new Map(camps.map(c=>[String(c.campaignId),c]));
const moves=[];
for(const [id,want] of Object.entries(WANT)){
  const c=B.get(id); if(!c){console.log('MISSING campaign '+id);continue;}
  const now=c.budget?.budget??0;
  if(Math.abs(now-want)>0.004) moves.push({id,side:SIDE[id],now,want,name:String(c.name).slice(0,34)});
}
console.log((APPLY?'APPLYING':'DRY RUN')+'\n');
console.log('side     campaign           now       ->  want      change     name');
for(const m of moves.sort((a,b)=>(b.want-b.now)-(a.want-a.now)))
 console.log('  '+m.side.padEnd(8)+m.id.padEnd(19)+('$'+m.now.toFixed(2)).padStart(8)+'  -> '+('$'+m.want.toFixed(2)).padStart(9)
  +('  '+(m.want>m.now?'+':'')+'$'+(m.want-m.now).toFixed(2)).padStart(12)+'   '+m.name);
if(!moves.length) console.log('  (every paired campaign is already at a true 50%)');
const sum=s=>Object.entries(WANT).filter(([id])=>SIDE[id]===s).reduce((t,[,v])=>t+v,0);
console.log('\n  after this: Single $'+sum('Single').toFixed(2)+'/day   2-Pack $'+sum('2-Pack').toFixed(2)+'/day   total $'+(sum('Single')+sum('2-Pack')).toFixed(2));
console.log('  the pre-change baseline across these campaigns was $567.00/day, so this is an exact 50/50.');
if(!APPLY){console.log('\nnothing written. add --apply');process.exit(0);}
const chunk=(a,n)=>a.length?[a.slice(0,n),...chunk(a.slice(n),n)]:[];
for(const g of chunk(moves,10)){
  const r=await fetch('https://advertising-api.amazon.com/sp/campaigns',{method:'PUT',headers:H(CT),
    body:JSON.stringify({campaigns:g.map(m=>({campaignId:m.id,budget:{budget:m.want,budgetType:'DAILY'}}))})});
  const t=await r.text(); let j=null; try{j=JSON.parse(t)}catch{}
  console.log('\nPUT '+g.length+'  http '+r.status+'  success '+((j?.campaigns?.success||[]).length));
  for(const e of (j?.campaigns?.error||[])) console.log('  '+JSON.stringify(e).slice(0,240));
}
camps=await list();
const A=new Map(camps.map(c=>[String(c.campaignId),c]));
let bad=0, s=0, t2=0;
for(const [id,want] of Object.entries(WANT)){
  const got=A.get(id)?.budget?.budget;
  if(Math.abs((got??-1)-want)>0.004){bad++;console.log('  NOT SET: '+id+' wanted $'+want+' got $'+got);}
  if(SIDE[id]==='Single') s+=got||0; else t2+=got||0;
}
console.log('\nVERIFIED '+(Object.keys(WANT).length-bad)+'/'+Object.keys(WANT).length+' campaigns at their true 50%');
console.log('Single side $'+s.toFixed(2)+'/day     2-Pack side $'+t2.toFixed(2)+'/day');
