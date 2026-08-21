/** Runs the REAL runAdEngine() against the Canadian profile, dryRun. Applies nothing. */
import { readFileSync } from 'node:fs';
for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!(m[1]in process.env))process.env[m[1]]=m[2].trim();}
const { runAdEngine, summarizeAdEngine } = await import('../src/lib/amazon/ad-engine.ts');
const profileId = process.env.ADS_PROFILE_ID_CA!;
console.log(`running the engine against CA profile ${profileId}, dryRun\n`);
const r = await runAdEngine({ dryRun: true, profileId });
console.log(summarizeAdEngine(r));
console.log('\n--- raw counts ---');
console.log({ ok:r.ok, dryRun:r.dryRun, killed:r.killed.length, bids:r.bids.length, added:r.added.length,
              needsConfirm:r.needsConfirm.length, revived:r.revived.length, errors:r.errors.length, ms:r.durationMs });
if(r.notes.length){ console.log('\nnotes:'); r.notes.forEach(n=>console.log('  '+n)); }
if(r.errors.length){ console.log('\nerrors:'); r.errors.forEach(n=>console.log('  '+n)); }
console.log('\nfirst 15 bid moves:');
for(const b of r.bids.slice(0,15)) console.log('  ', JSON.stringify(b).slice(0,190));
