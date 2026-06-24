/** Draft replies to the Flippa buyer messages (threaded; replying to no-reply@flippa.com routes
 *  back into the Flippa discussion). DRAFTS ONLY — William reviews/edits/sends. Bracketed [...] =
 *  William's decisions (price, access, contact). Account-health facts are VALIDATED (0 issues).
 *  RUN: node scripts/flippa-drafts.mjs        (preview)
 *       MODE=create node scripts/flippa-drafts.mjs   (create the Gmail drafts) */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const LIVE=process.env.MODE==='create';
const tok=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GMAIL_CLIENT_ID,client_secret:process.env.GMAIL_CLIENT_SECRET,refresh_token:process.env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const G='https://gmail.googleapis.com/gmail/v1/users/me', H={Authorization:`Bearer ${tok}`,'Content-Type':'application/json'};

const REPLIES = {
  sami: `Hi Sami,

Good question on payouts. Amazon's standard disbursement runs about every 14 days to the linked bank account, covering roughly two weeks of orders (for items delivered at least 7 days prior), minus fees, and then takes 3 to 5 business days to land in the bank. Amazon also holds a standard reserve against returns and chargebacks. There is no native daily payout. Some sellers use a third party like Payability for daily access to their balance, but that is a separate service, not Amazon itself.

On the Payments screenshot: rather than a static image, the cleaner way to verify is a quick screen-share during due diligence so you can watch the live Payments and settlement reports directly. Numbers move on a live screen and can't be edited, and it keeps the account details secure for both of us. Mark from Flippa has offered to set up a call, which is a good place to do that.

[William: add your preferred call time/number here if you'd like to take it to a call.]

Best,
William`,
  mark: `Hi Mark,

Thanks for stepping in. A call works well. [William: confirm 3:00 to 5:00pm EST today, or grab a slot on your calendar link.] I'll keep everything in this thread as you suggested.

Talk soon,
William`,
  jack: `Hi Jack,

Thanks for reaching out. A store-only structure is workable, and it's actually the standard way these deals are set up: the business (brand, listings, and account) is priced separately from inventory either way. Most buyers take the remaining FBA stock at landed cost via a count at closing, so they keep selling from day one without a stockout or a rank dip on the very listings they're buying. If you'd rather exclude inventory entirely, we can structure that too and I'll handle the remaining stock.

Happy to talk through both options and the number you had in mind. Mark from Flippa can help lay out the structure.

[William: confirm you're open to store-only, and any price floor, before sending.]

Best,
William`,
  jessica: `Hi Jessica,

I appreciate you taking the time and being upfront. The break-even has to make sense for you, and that's fair. If your situation changes, or if a different structure would help (for example, excluding the remaining inventory to lower the entry price), I'd be glad to revisit. Either way, thank you and best of luck.

William`,
  alex: `Hi Alex,

Happy to share. Here's where things stand on the account:

- Account health: in good standing. The Account Health Rating is healthy, with 0 policy warnings, 0 intellectual-property complaints, 0 authenticity complaints, 0 product-condition complaints, and no listing suppressions. All listings are active and discoverable.
- Lifetime units sold: close to 18,000 over the life of the listing, of which about 8,926 were ad-attributed and the remainder organic. The roughly even split shows healthy organic demand, not just ad-driven sales. [William: confirm the figure you want stated.]
- Current inventory: 420 units on hand, roughly $376 at landed cost, across the Single, 2-Pack, 3-Pack and Pro. Inventory is handled separately from the sale price, valued at landed cost with a count at closing, which is the standard structure.
- Verification: rather than screenshots, I can do a verified screen-share of Business Reports, Payments, and settlement reports on a call, and grant view-only, time-limited Seller Central access during due diligence once we're under NDA. That's standard for serious buyers and lets you confirm every number yourself.
- Price: [William: open to discussing depending on due diligence? confirm.]

Glad to set up a call or screen-share with Mark once you've had a look.

Best,
William`,
};
const KEY = (from, snip) => {
  const s = (from + ' ' + snip).toLowerCase();
  if (/discount2|alex/.test(s)) return 'alex';
  if (/mark aurelio/.test(s)) return 'mark';
  if (/jack/.test(s)) return 'jack';
  if (/jessica/.test(s)) return 'jessica';
  if (/sami/.test(s)) return 'sami';
  return null;
};

if(LIVE){ // idempotent: clear any prior Flippa drafts so we don't duplicate / leave stale copies
  const dl=await fetch(`${G}/drafts?maxResults=100`,{headers:H}).then(r=>r.json());
  let del=0;
  for(const d of (dl.drafts||[])){
    const dm=await fetch(`${G}/drafts/${d.id}?format=metadata`,{headers:H}).then(r=>r.json());
    const to=(dm.message?.payload?.headers||[]).find(x=>x.name.toLowerCase()==='to')?.value||'';
    if(to.includes('no-reply@flippa.com')){await fetch(`${G}/drafts/${d.id}`,{method:'DELETE',headers:H});del++;}
  }
  if(del)console.log(`(cleared ${del} prior Flippa draft(s))`);
}
const list = await fetch(`${G}/messages?q=${encodeURIComponent('from:no-reply@flippa.com subject:"New message on listing Phone Assured" newer_than:10d')}&maxResults=20`,{headers:H}).then(r=>r.json());
const ids=(list.messages||[]).map(m=>m.id);
const done=new Set(); let made=0;
for(const id of ids){
  const m=await fetch(`${G}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=Date`,{headers:H}).then(r=>r.json());
  const h=Object.fromEntries((m.payload?.headers||[]).map(x=>[x.name.toLowerCase(),x.value]));
  const key=KEY(h.from||'', m.snippet||'');
  if(!key || done.has(key)) continue;     // newest-first, one reply per person
  done.add(key);
  console.log(`\n### Reply to ${key} (${(h.from||'').replace(/<.*/,'').trim()}) — ${h.date}`);
  console.log(REPLIES[key]);
  if(LIVE){
    const raw=[`From: Phone Assured <hello@phoneassured.com>`,`To: no-reply@flippa.com`,`Subject: Re: ${h.subject}`,`In-Reply-To: ${h['message-id']}`,`References: ${h['message-id']}`,'Content-Type: text/plain; charset=UTF-8','',REPLIES[key]].join('\r\n');
    const b64=Buffer.from(raw,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const r=await fetch(`${G}/drafts`,{method:'POST',headers:H,body:JSON.stringify({message:{threadId:m.threadId,raw:b64}})});
    console.log(r.ok?'  -> draft created ✓':'  -> draft FAILED '+r.status);
    if(r.ok)made++;
  }
}
console.log(LIVE?`\n${made} drafts created (in your Drafts folder — review, fill [brackets], send).`:'\n(preview — MODE=create to create the Gmail drafts)');
