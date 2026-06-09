/**
 * One-time Amazon Advertising API OAuth — mints the Ads refresh token (SEPARATE
 * from SP-API). Scope: cpc_advertising:campaign_management.
 *
 * PREREQUISITES (William):
 *  1. In the Ads API "Approved" email, click "Assign API access" to bind it to
 *     your Login-with-Amazon (LWA) app ("Hello App Phone Assured").
 *  2. At developer.amazon.com → Login with Amazon → your security profile → Web
 *     Settings: copy Client ID + Client Secret, and add this Allowed Return URL:
 *        http://localhost:53682
 *  3. Put creds in .env.local:
 *        ADS_CLIENT_ID=amzn1.application-oa2-client...
 *        ADS_CLIENT_SECRET=...
 *
 * RUN: node scripts/ads-auth-setup.mjs   → open the printed URL, sign in as
 * hello@phoneassured.com, approve. It prints ADS_REFRESH_TOKEN for .env.local.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'cpc_advertising:campaign_management';

function loadEnv(){try{const r=readFileSync(new URL('../.env.local',import.meta.url),'utf8');for(const l of r.split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2];}}catch{}}
loadEnv();
const CID=process.env.ADS_CLIENT_ID, CS=process.env.ADS_CLIENT_SECRET;
if(!CID||!CS){console.error('Missing ADS_CLIENT_ID / ADS_CLIENT_SECRET in .env.local (see header).');process.exit(1);}

const authUrl='https://www.amazon.com/ap/oa?'+new URLSearchParams({
  client_id:CID, scope:SCOPE, response_type:'code', redirect_uri:REDIRECT,
}).toString();
console.log('\n1. Open this URL, sign in as hello@phoneassured.com, and approve:\n\n'+authUrl+'\n');

const server=http.createServer(async (req,res)=>{
  const u=new URL(req.url,REDIRECT);
  const code=u.searchParams.get('code'), err=u.searchParams.get('error');
  if(!code&&!err){res.writeHead(404).end();return;}
  if(err||!code){res.writeHead(400).end('OAuth error: '+(err||'no code'));console.error('failed:',err);server.close();process.exit(1);}
  try{
    const tok=await fetch('https://api.amazon.com/auth/o2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:REDIRECT,client_id:CID,client_secret:CS}).toString()});
    const j=await tok.json();
    if(!tok.ok||!j.refresh_token) throw new Error(JSON.stringify(j));
    res.writeHead(200,{'Content-Type':'text/plain'}).end('Done — return to the terminal.');
    console.log('\nSuccess. Add to .env.local (and Vercel env):\n\nADS_REFRESH_TOKEN='+j.refresh_token+'\n\nThen run: node scripts/ads-profiles.mjs  (to get your Profile ID)\n');
  }catch(e){res.writeHead(500).end('exchange failed');console.error('token exchange failed:',e.message);}
  finally{server.close();process.exit(0);}
});
server.listen(PORT,()=>console.log(`Waiting for redirect on ${REDIRECT} ...`));
