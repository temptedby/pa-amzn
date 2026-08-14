/**
 * PACR RULES — the pure, testable rule engine behind the Phone Assured creative gate.
 *
 * Modelled on the Social Scene BRC (scripts/social-scene-brc-gate.py + brc_guard.py). Same
 * contract: rules are checked BEFORE anything is rendered, and a renderer that has not passed
 * cannot run. This file holds the rules only. The gate CLI and the renderer guard both import
 * it, so the two can never drift.
 *
 * Plain .mjs on purpose: vitest imports it from a .ts test, and scripts/pacr/*.mjs import the
 * same file directly. One source of truth.
 *
 * Rule numbers match confabulator/PACR-phone-assured-creative-rules.md. Append-only, newest wins.
 */

/** Surfaces an asset can be built for. Amazon surfaces carry Amazon's rules; the others do not. */
export const SURFACES = [
  "amazon-main",
  "amazon-secondary",
  "amazon-aplus",
  "amazon-sbv",
  "amazon-title",
  "social-feed",
  "social-story",
  "site",
  "email",
];

export const isAmazon = (surface) => String(surface || "").startsWith("amazon");

/** Provenance we will accept for a source file. Anything else is a hard fail (PACR 2, PACR 6). */
export const OK_PROVENANCE = ["own-photo", "own-video", "own-render", "stock-verified"];

/** The products that still exist. William 2026-08-09: the wristband and necklace are gone. */
export const LIVE_PRODUCTS = ["BLACK", "PRO", "BOTH"];

/** PACR 43 - the discontinued line. Any mention in copy, alt text or an asset name fails. */
export const DISCONTINUED = /\b(wrist ?bands?|necklaces?|neck ?lanyards?|neck\/wrist|neck and wrist|adhesive tabs?|3m tabs?)\b/i;

/**
 * PACR 43b - the discontinued SHOOTS, by folder name. Kept separate from DISCONTINUED on purpose:
 * the copy rule stays literal to what William said (wristband, necklace), while this one names the
 * five Drive folders that are factually the lanyard shoot. Blocking the bare word "lanyard" in copy
 * would be wider than the stated rule, and our own listings still use it as a search term.
 */
export const DISCONTINUED_SOURCE = /(final lanyard images|clip w-? lanyard|[\/ ]lanyards?[\/.]|27 april\/lanyards|july 7\/lanyard)/i;

/** PACR 7 - we sell peace of mind, not panic. */
export const FEAR_WORDS = /\b(panic|terrified|terrifying|scared|victim|mugged|robbed|nightmare|disaster|horror)\b/i;

/** PACR 8 - no AI-sounding copy. These are the tells. */
export const AI_TELLS = /(\belevate your\b|\bunlock the\b|in today'?s fast[- ]paced|\bgame[- ]changer\b|\brevolutionary\b|seamlessly integrate|look no further|\bdelve into\b)/i;

/** PACR 10 - Amazon main image bans promotional text and badges. */
export const BADGE_WORDS = /(\bbest ?value\b|\bbest ?seller\b|amazon'?s choice|#1\b|\bsale\b|\bdiscount\b|free shipping|limited time|today only|\b\d+[- ]pack\b|\bsave \d|\d+% off)/i;

/** PACR 5 - Amazon prohibits these in the TITLE. */
export const WARRANTY_WORDS = /\b(warrant\w*|guarantee\w*|lifetime)\b/i;

/** PACR 4 - review language and star ratings may not appear on an Amazon surface. */
export const REVIEW_TELLS = /(★|⭐|\b\d(\.\d)? ?stars?\b|\bverified purchase\b|\breviewer\b|\bcustomers? (say|rate)\b|\b\d[,\d]* (happy customers|reviews)\b)/i;

/**
 * PACR 44 - no strength number until it has been physically measured.
 * Competitors publish oz figures (ClutchLoop 10 oz, Oaridey 15 oz). We may not answer with an
 * invented one. A claim of this kind only passes when the measurement registry says it is verified.
 */
export const STRENGTH_CLAIM = /(\b\d+(\.\d+)? ?(oz|ounce|lb|pound|kg)\b[^.]{0,40}\b(hold|load|bear|support|capacity|retract)|\b(hold|holds|load|bear|bears|support|supports|capacity|retract|retraction)\b[^.]{0,40}\b\d+(\.\d+)? ?(oz|ounce|lb|pound|kg)\b)/i;

/** PACR 45 - the only weight claim we may make, and the phrasing that keeps it safe. */
export const WEIGHT_LINE_G = 171;
export const TESTED_WITH = /\btested (with|on)\b/i;

/** PACR 14 - a headline has to survive a 200x200 thumbnail. */
export const THUMBNAIL_HEADLINE_MAX = 42;

/** PACR 15 - Amazon enforces 75 characters since 2026-07-27. */
export const TITLE_MAX = 75;

/** PACR 11 - Amazon needs 2000px on the long side. */
export const AMAZON_MIN_LONG_SIDE = 2000;

// PACR 11 is SURFACE-SCOPED, corrected 2026-08-10. The 2000px rule is Amazon's requirement for the
// main and secondary gallery images, where it enables zoom. A+ modules are a different surface with
// fixed canvases, and 970x600 can never satisfy 2000px — the original rule blocked every legitimate
// A+ asset. Confirmed against the live account: we hold STANDARD A+ (contentType EBC), so these are
// the canvases available to us. Premium sizes are deliberately absent because we cannot use them.
export const APLUS_CANVASES = {
  STANDARD_HEADER_IMAGE_TEXT:  [970, 600],
  STANDARD_IMAGE_TEXT_OVERLAY: [970, 300],
  STANDARD_THREE_IMAGE_TEXT:   [300, 300],
  STANDARD_FOUR_IMAGE_TEXT:    [220, 220],
  STANDARD_COMPANY_LOGO:       [600, 180],
};
/** Standard A+ caps images at 2 MB. Premium's 5 MB does not apply to us. */
export const APLUS_MAX_BYTES = 2 * 1024 * 1024;

/** PACR 46 - the product must be on screen before the scroll decision is made. */
export const HOOK_MAX_SECONDS = 3;

/** PACR 50 - how far back a template may not repeat on the same surface. */
export const TEMPLATE_NO_REPEAT = 6;

const fail = (rule, message) => ({ rule, message });
const textOf = (intent) =>
  [intent.headline, ...(intent.body || []), intent.alt_text, intent.caption, intent.title]
    .filter(Boolean)
    .join("  ");

/**
 * Check one candidate asset against every rule.
 * @returns {{ok: boolean, failures: {rule: string, message: string}[], warnings: {rule: string, message: string}[]}}
 */
export function checkIntent(intent, ctx = {}) {
  const failures = [];
  const warnings = [];
  const t = textOf(intent);
  const surface = intent.surface;
  const amazon = isAmazon(surface);

  // ---- shape ----------------------------------------------------------------
  if (!SURFACES.includes(surface)) {
    failures.push(fail("INTENT", `surface "${surface}" is not one of ${SURFACES.join(", ")}`));
  }
  if (!LIVE_PRODUCTS.includes(intent.product)) {
    failures.push(fail("PACR 43", `product "${intent.product}" is not live. Only ${LIVE_PRODUCTS.join(", ")} remain.`));
  }

  // ---- 1. HARD FAILS --------------------------------------------------------
  if (intent.product_visible !== true) {
    failures.push(fail("PACR 1", "no asset ships without the product visible. Set product_visible after checking the frame, not before."));
  }

  const sources = intent.source_assets || [];
  if (sources.length === 0) {
    failures.push(fail("PACR 2", "no source assets declared. Every asset must be built from real photography we own."));
  }
  for (const s of sources) {
    if (!OK_PROVENANCE.includes(s.provenance)) {
      failures.push(fail(
        s.provenance === "ai-generated" ? "PACR 2" : "PACR 6",
        `source "${s.name || s.id}" has provenance "${s.provenance}". Allowed: ${OK_PROVENANCE.join(", ")}.`,
      ));
    }
    const sname = String(s.name || "");
    if (DISCONTINUED.test(sname) || DISCONTINUED_SOURCE.test(sname)) {
      failures.push(fail("PACR 43", `source "${s.name}" is from the discontinued lanyard line.`));
    }
  }

  if (intent.shows_phone_hauled_up === true) {
    failures.push(fail("PACR 3", "never show a phone being hauled UP by the cord. Show the catch, never the climb."));
  }

  if (amazon && REVIEW_TELLS.test(t)) {
    failures.push(fail("PACR 4", "review text and star ratings are prohibited on Amazon surfaces. Attributed quotes are off-Amazon only."));
  }

  if (surface === "amazon-title" && WARRANTY_WORDS.test(t)) {
    failures.push(fail("PACR 5", "Amazon prohibits warranty and guarantee wording in the title. It belongs in images, A+ and bullets."));
  }

  if (FEAR_WORDS.test(t)) {
    failures.push(fail("PACR 7", "no fear-based creative. We sell peace of mind, not panic."));
  }

  if (/—/.test(t)) failures.push(fail("PACR 8", "no em dashes anywhere."));
  if (AI_TELLS.test(t)) failures.push(fail("PACR 8", "copy reads as AI-written. Rewrite it plainly."));

  // ---- 2. AMAZON TECHNICAL SPEC --------------------------------------------
  if (surface === "amazon-main") {
    if (intent.headline || (intent.body || []).length) {
      failures.push(fail("PACR 10", "the main image carries no text at all. Move the message to a secondary slot."));
    }
    if (BADGE_WORDS.test(t)) {
      failures.push(fail("PACR 10", "the main image carries no badges or promotional wording."));
    }
    if (intent.background !== "pure-white") {
      failures.push(fail("PACR 10", `main image background must be pure-white RGB 255,255,255 (got "${intent.background}").`));
    }
  }

  if (amazon && intent.size) {
    const [w, h] = String(intent.size).split("x").map(Number);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      if (surface === "amazon-aplus") {
        // A+ has fixed canvases, so the test is an exact match against the module, not a minimum.
        // A mis-sized A+ image is not rejected by Amazon; it is silently rescaled and goes soft,
        // which is worse because nothing tells you it happened.
        const canvas = APLUS_CANVASES[intent.module_type];
        if (!intent.module_type) {
          failures.push(fail("PACR 11", `an A+ asset must name its module_type, one of ${Object.keys(APLUS_CANVASES).join(", ")}.`));
        } else if (!canvas) {
          failures.push(fail("PACR 11", `"${intent.module_type}" is not a Standard A+ module. We hold STANDARD A+ only, so Premium modules are unavailable.`));
        } else if (w !== canvas[0] || h !== canvas[1]) {
          failures.push(fail("PACR 11", `${intent.module_type} is exactly ${canvas[0]}x${canvas[1]} (got ${intent.size}). Amazon rescales a mismatch silently and the image goes soft.`));
        }
      } else if (Math.max(w, h) < AMAZON_MIN_LONG_SIDE) {
        failures.push(fail("PACR 11", `render at ${AMAZON_MIN_LONG_SIDE}px minimum on the long side (got ${intent.size}).`));
      }
    }
  }

  // PACR 11b. Standard A+ caps at 2 MB per image. Only checkable when the caller measures the
  // rendered file, so it is a no-op at gate time and a real check in the renderer.
  if (surface === "amazon-aplus" && typeof ctx.renderedBytes === "number" && ctx.renderedBytes > APLUS_MAX_BYTES) {
    failures.push(fail("PACR 11", `${(ctx.renderedBytes / 1048576).toFixed(2)} MB exceeds the 2 MB Standard A+ limit.`));
  }

  if (intent.headline && intent.headline.length > THUMBNAIL_HEADLINE_MAX) {
    warnings.push(fail("PACR 14", `headline is ${intent.headline.length} chars. Over ${THUMBNAIL_HEADLINE_MAX} it dies at a 200x200 thumbnail.`));
  }

  if (surface === "amazon-title" && (intent.title || "").length > TITLE_MAX) {
    failures.push(fail("PACR 15", `title is ${intent.title.length} chars, over the ${TITLE_MAX} Amazon enforces.`));
  }

  // ---- 3. THE 2026-08-09 ADDITIONS -----------------------------------------
  if (DISCONTINUED.test(t)) {
    failures.push(fail("PACR 43", "the wristband, necklace and adhesive tabs are discontinued. Remove them from the copy."));
  }

  if (STRENGTH_CLAIM.test(t) && ctx.strengthVerified !== true) {
    failures.push(fail("PACR 44", "no load, capacity or retraction figure until it has been physically measured. Competitors publish one; we may not invent one."));
  }

  if (TESTED_WITH.test(t)) {
    failures.push(fail("PACR 45", 'never claim "tested with" across a phone list. Only an iPhone 16 in a case has actually been tested. Say the weight class instead.'));
  }
  const gm = t.match(/\b(\d{3}) ?g\b/);
  if (gm && Number(gm[1]) !== WEIGHT_LINE_G && !ctx.allowOtherWeights) {
    warnings.push(fail("PACR 45", `${gm[1]} g appears in the copy. The line that splits BLACK from PRO is ${WEIGHT_LINE_G} g.`));
  }

  if (intent.asset_type === "video") {
    if (!(Number(intent.hook_seconds) <= HOOK_MAX_SECONDS)) {
      failures.push(fail("PACR 46", `the product must be on screen within ${HOOK_MAX_SECONDS}s (got ${intent.hook_seconds}). The scroll decision is made in about 1.7s.`));
    }
    if (intent.captions !== true) {
      failures.push(fail("PACR 47", "video needs burned-in captions. Most Amazon and social browsing is muted."));
    }
  }

  const tm = intent.testimonial;
  if (tm) {
    if (tm.ai_generated === true) {
      failures.push(fail("PACR 48", "the FTC treats AI-generated testimonials as fake reviews. A testimonial must be a real person's honest opinion."));
    }
    if (tm.real !== true) {
      failures.push(fail("PACR 48", "testimonial is not marked as a real person who used the product."));
    }
    if (tm.consent !== true) {
      failures.push(fail("PACR 48", `no recorded consent from ${tm.person || "the person"} to use their face and words commercially.`));
    }
    if (tm.material_connection && tm.disclosed !== true) {
      failures.push(fail("PACR 48", `${tm.person || "the person"} has a material connection ("${tm.material_connection}") that the FTC requires disclosing where the audience sees it without expanding anything.`));
    }
    if (amazon) {
      failures.push(fail("PACR 4", "attributed testimonials are off-Amazon only."));
    }
  }

  if (intent.alt_text !== undefined || amazon) {
    if (!intent.alt_text) {
      failures.push(fail("PACR 49", "alt text is required. The live A+ has none in English, which is how Hebrew survived on a US listing for two years."));
    } else if (!/^[\x00-\x7F\s]*$/.test(intent.alt_text)) {
      failures.push(fail("PACR 49", `alt text "${intent.alt_text}" is not English. The live A+ alt text is Hebrew and the 2026 draft is Spanish.`));
    }
  }

  const recent = ctx.recentTemplates || [];
  if (intent.template_id && recent.slice(0, TEMPLATE_NO_REPEAT).includes(intent.template_id)) {
    failures.push(fail("PACR 50", `template "${intent.template_id}" was used in the last ${TEMPLATE_NO_REPEAT} assets on this surface. Vary the layout.`));
  }

  return { ok: failures.length === 0, failures, warnings };
}

/**
 * The fields that define an asset's identity. The gate hashes these and the guard recomputes the
 * same hash, so a renderer cannot be pointed at a different intent than the one that passed.
 * Byte-identical canonicalisation on both sides, exactly as BRC does it.
 */
export const CANON_FIELDS = [
  "surface",
  "product",
  "asset_type",
  "template_id",
  "headline",
  "body",
  "alt_text",
  "size",
  "output",
];

const sortKeys = (o) => {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (o && typeof o === "object") {
    const r = {};
    for (const k of Object.keys(o).sort()) r[k] = sortKeys(o[k]);
    return r;
  }
  return o;
};

export function canonical(intent) {
  const c = {};
  for (const k of CANON_FIELDS) c[k] = k in intent ? intent[k] : null;
  return JSON.stringify(sortKeys(c));
}
