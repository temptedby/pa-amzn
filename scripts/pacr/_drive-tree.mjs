import fs from 'node:fs'; import { createSign } from 'node:crypto';
const CREDS='/Users/williamholdeman/projects/wdh-personal/secrets/google-writer.json';
const b64u=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const c=JSON.parse(fs.readFileSync(CREDS,'utf8')); const now=Math.floor(Date.now()/1000);
const head=`${b64u(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${b64u(JSON.stringify({iss:c.client_email,sub:'william@besocialscene.com',scope:'https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now}))}`;
const TOK=(await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${b64u(createSign('RSA-SHA256').update(head).sign(c.private_key))}`}).then(r=>r.json())).access_token;
const H={Authorization:`Bearer ${TOK}`};
const q=encodeURIComponent("name='2026 Phone Assured All Materials' and mimeType='application/vnd.google-apps.folder' and trashed=false");
const parent=((await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,{headers:H}).then(r=>r.json())).files||[])[0];
console.log('PARENT:', parent ? `${parent.name}  ${parent.id}` : 'NOT FOUND');
if(parent){
  const kids=await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${parent.id}' in parents and trashed=false`)}&fields=files(id,name,mimeType)&pageSize=100`,{headers:H}).then(r=>r.json());
  for(const f of (kids.files||[])) console.log(`  ${f.mimeType.includes('folder')?'[dir]':'     '} ${f.name}   ${f.id}`);
}
const g=await fetch('https://www.googleapis.com/drive/v3/files/1k_E69J8gN_urwVUa19BlxL1wczf6RJic?fields=id,name,parents',{headers:H});
console.log('\nGraphics folder:', g.status, g.status===200 ? JSON.stringify(await g.json()) : '');
