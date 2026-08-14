/** One design system for every Phone Assured asset, so the set reads as a set.
 *
 *  William 2026-08-10: "clean up the design and graphics a little bit, show more action shots",
 *  and "make it a little more clean about the product".
 *
 *  Built after looking at what actually outsells us. The pattern across Pulpo, Oaridey and
 *  ClutchLoop is the same three things, and we were doing none of them:
 *    1. the product is shown BIG and close, not small on a white field
 *    2. a person is USING it in the same frame, not posing beside it
 *    3. one callout names the part or the mechanism, and nothing else competes with it
 *
 *  So: one accent, one type scale, one caption treatment, lots of air. Text sits on a solid
 *  block rather than floating over photography, because over a busy frame it becomes unreadable
 *  at thumbnail size and thumbnail size is where the decision happens.
 */
export const INK = '#101F24';
export const SEA = '#0B6E73';       // single accent, taken from the Cozumel water in our own shots
export const PAPER = '#FFFFFF';
export const MUTED = '#5C7278';
export const SCRIM = 'rgba(9,20,24,.62)';

/** One scale. Sizes are for a 970x600 A+ canvas and scale up for 2000px and 1080x1920. */
export const TYPE = { display: 58, head: 40, body: 26, label: 20 };
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A caption block pinned to the bottom of a frame. Solid, not a gradient: a gradient over
 *  photography still fails on a light frame, and half our library is bright sun and pale stone. */
export function captionBlock(w, h, head, sub, opts = {}) {
  const pad = opts.pad ?? 34;
  const hs = opts.headSize ?? TYPE.head, bs = opts.bodySize ?? TYPE.body;
  const blockH = sub ? hs + bs + pad * 2 + 12 : hs + pad * 2;
  const top = h - blockH;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${top}" width="${w}" height="${blockH}" fill="${SCRIM}"/>
    <rect x="0" y="${top}" width="${Math.round(w * 0.14)}" height="5" fill="${SEA}"/>
    <text x="${pad}" y="${top + pad + hs * 0.78}" font-family="Helvetica,Arial" font-size="${hs}"
          font-weight="800" letter-spacing="-1" fill="#ffffff">${esc(head)}</text>
    ${sub ? `<text x="${pad}" y="${top + pad + hs + 12 + bs * 0.78}" font-family="Helvetica,Arial"
          font-size="${bs}" fill="#D6E9EA">${esc(sub)}</text>` : ''}
  </svg>`;
}

/** A single callout naming one part. Competitors label the part; we never have. */
export function calloutPill(x, y, text, size = TYPE.label) {
  // 0.62 em per character under-measured Helvetica caps with letter-spacing, so long labels were
  // drawn wider than their pill and clipped at the edge ("TETHER TAB FOR YOUR" lost "CASE").
  // 0.72 plus the 1px tracking matches the rendered width.
  const w = text.length * (size * 0.72 + 1) + size * 1.8, h = size * 2.1;
  return `<g><rect x="${x}" y="${y}" rx="${h / 2}" width="${w}" height="${h}" fill="${SEA}"/>
    <text x="${x + w / 2}" y="${y + h * 0.68}" text-anchor="middle" font-family="Helvetica,Arial"
      font-size="${size}" font-weight="700" letter-spacing="1" fill="#ffffff">${esc(text)}</text></g>`;
}
