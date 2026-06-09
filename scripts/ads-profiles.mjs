/** Fetch Amazon Advertising profiles to get your Profile ID (for ADS_PROFILE_ID).
 *  RUN after ads-auth-setup.mjs: node scripts/ads-profiles.mjs */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const {ADS_CLIENT_ID:CID,ADS_CLIENT_SECRET:CS,ADS_REFRESH_TOKEN:RT}=process.env;
if(!CID||!CS||!RT){console.error('Missing ADS_CLIENT_ID/SECRET/REFRESH_TOKEN in .env.local');process.exit(1);}
const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:RT,client_id:CID,client_secret:CS}).toString()}).then(r=>r.json()).then(j=>j.access_token);
const r=await fetch('https://advertising-api.amazon.com/v2/profiles',{headers:{Authorization:`Bearer ${tok}`,'Amazon-Advertising-API-ClientId':CID}});
const t=await r.text(); if(!r.ok){console.error('profiles failed '+r.status+': '+t.slice(0,300));process.exit(1);}
const profiles=JSON.parse(t);
console.log('\nYour advertising profiles:');
for(const p of profiles) console.log(`  profileId=${p.profileId}  ${p.countryCode}  ${p.currencyCode}  ${p.accountInfo?.type||''} ${p.accountInfo?.name||''}`);
const us=profiles.find(p=>p.countryCode==='US');
if(us) console.log(`\nAdd to .env.local:\nADS_PROFILE_ID=${us.profileId}\n`);
