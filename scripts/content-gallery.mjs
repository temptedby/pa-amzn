/** Build an HTML gallery of all Phone Assured content (from content-registry.json) and open it
 *  in the browser for review/approval. Shows status, compliance, angle (dedup), and the cited basis.
 *  RUN: node scripts/content-gallery.mjs   (add --no-open to skip launching the browser) */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extname } from 'node:path';
import { URL } from 'node:url';

const reg = JSON.parse(readFileSync(new URL('../confabulator/content-registry.json', import.meta.url), 'utf8'));
const mime = (f) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[extname(f).toLowerCase()] || 'image/png');
const dataUri = (f) => existsSync(f) ? `data:${mime(f)};base64,${readFileSync(f).toString('base64')}` : '';
const badge = (s) => ({ draft: '#888', review: '#0B3D91', approved: '#1a7f37', live: '#b54708' }[s] || '#444');

const angles = [...new Set(reg.assets.map(a => a.angle))];
const card = (a) => {
  const src = dataUri(a.file);
  return `<div class="card">
    <div class="imgwrap">${src ? `<img src="${src}">` : `<div class="missing">file not found<br><small>${a.file}</small></div>`}</div>
    <div class="meta">
      <div class="row"><b>${a.headline || a.id}</b>
        <span class="pill" style="background:${badge(a.status)}">${a.status.toUpperCase()}</span></div>
      <div class="sub">${a.type} · angle: <code>${a.angle}</code> ${a.newly_built ? '· <span class="new">NEW</span>' : ''}</div>
      <div class="sub">compliant: ${a.compliant ? '✅' : '⚠️ NO'}</div>
      <div class="basis"><b>Basis:</b> ${a.basis || ''}</div>
      <div class="basis"><b>Sources:</b> ${(a.sources || []).join(', ')}</div>
    </div></div>`;
};

const html = `<!doctype html><html><head><meta charset="utf8"><title>Phone Assured — Content Gallery</title><style>
  body{font-family:-apple-system,Arial,sans-serif;margin:0;background:#f4f5f7;color:#111}
  header{background:#0B3D91;color:#fff;padding:20px 28px}
  header h1{margin:0;font-size:22px} header p{margin:6px 0 0;opacity:.9;font-size:14px}
  .angles{padding:14px 28px;background:#fff;border-bottom:1px solid #e5e7eb;font-size:14px}
  .angles code{background:#eef;padding:2px 8px;border-radius:10px;margin:0 4px;display:inline-block}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px;padding:24px 28px}
  .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .imgwrap{background:#fafafa;display:flex;align-items:center;justify-content:center;height:300px;border-bottom:1px solid #eee}
  .imgwrap img{max-width:100%;max-height:300px;object-fit:contain}
  .missing{color:#999;text-align:center;font-size:13px}
  .meta{padding:14px 16px} .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .pill{color:#fff;font-size:11px;padding:3px 9px;border-radius:10px;white-space:nowrap}
  .sub{color:#555;font-size:13px;margin-top:6px} .new{color:#1a7f37;font-weight:bold}
  .basis{color:#666;font-size:12px;margin-top:8px;line-height:1.4} code{background:#eef;padding:1px 5px;border-radius:5px}
  footer{padding:18px 28px;color:#666;font-size:13px}
</style></head><body>
  <header><h1>Phone Assured — Content Gallery</h1>
    <p>${reg.assets.length} assets · updated ${reg.updated} · <b>Nothing goes live without your approval.</b></p></header>
  <div class="angles"><b>Angles covered (don't duplicate):</b> ${angles.map(a => `<code>${a}</code>`).join('')}</div>
  <div class="grid">${reg.assets.map(card).join('')}</div>
  <footer>Status: draft → review → approved → live. Tell me which to approve; I'll prep the Seller Central upload (Playwright tab + click-through) only after your yes.</footer>
</body></html>`;

const out = '/tmp/pa-content-gallery.html';
writeFileSync(out, html);
console.log(`gallery: ${out}  (${reg.assets.length} assets, angles: ${angles.join(', ')})`);
if (!process.argv.includes('--no-open')) { try { execSync(`open "${out}"`); console.log('opened in browser ✓'); } catch (e) { console.log('open failed:', e.message); } }
