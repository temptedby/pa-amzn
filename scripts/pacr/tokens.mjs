/** The Phone Assured design system. Chosen, not inherited.
 *
 *  The pillar is DISCREET (William 2026-08-11), so the design itself is quiet: generous paper,
 *  one muted accent, one typeface in three weights, no shouting caps. The 2023 pack shouted in
 *  bright blue and heavy caps; this is deliberately its opposite, because the product's whole
 *  claim is that you stop noticing it.
 *
 *  Type: Avenir Next. Geometric humanist, real weight range, and specifically NOT Helvetica,
 *  which is the default that made the 08-10 build read as generated.
 *
 *  LONGHAND ONLY, never the `font:` shorthand. Chromium rejects the whole shorthand declaration
 *  if the family list contains `-apple-system`, which silently dropped BOTH the size and the family
 *  and rendered the first build in 16px Times. The overflow gate passed it, because a wrong
 *  typeface is not an overflow. Look at the pixels.
 */
export const C = {
  ink:    '#16191B',   // near-black, matched to the matte hardware
  slate:  '#2E4756',   // the accent. muted, confident, never shouts
  paper:  '#F6F5F2',   // warm off-white, so it reads considered rather than clinical
  muted:  '#5E686C',   // secondary text
  line:   '#DFDDD8',   // hairlines
  seal:   '#8C6A34',   // warm bronze, reserved ONLY for the warranty mark
  white:  '#FFFFFF',
};

export const FONT = `'Avenir Next','Avenir',Helvetica,sans-serif`;

const f = (weight, size, lh, extra = '') =>
  `font-family:${FONT};font-weight:${weight};font-size:${size}px;line-height:${lh};${extra}`;

/** One scale. Every size on the page comes from here. */
export const T = {
  eyebrow: f(600, 13, 1.2,  `letter-spacing:.17em;text-transform:uppercase;color:${C.slate};`),
  display: f(600, 46, 1.12, `letter-spacing:-.02em;color:${C.ink};`),
  head:    f(600, 31, 1.14, `letter-spacing:-.012em;color:${C.ink};`),
  sub:     f(500, 21, 1.3,  `letter-spacing:-.006em;color:${C.ink};`),
  body:    f(400, 17, 1.55, `color:${C.muted};`),
  small:   f(400, 14.5, 1.5,`color:${C.muted};`),
  label:   f(600, 13.5, 1.3,`letter-spacing:.02em;color:${C.ink};`),
};

export const RESET = `*{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:${C.paper};-webkit-font-smoothing:antialiased;
  text-rendering:geometricPrecision}
  img{display:block}`;

/** A media band sized FROM the source aspect. The single most important rule we carried over:
 *  never crop into the subject; let the design carry whatever space is left. */
export function band(m, { h, maxW = 9999 }) {
  const w = Math.min(Math.round(h * m.aspect), maxW);
  return { w, h, css: `width:${w}px;height:${h}px;` };
}
