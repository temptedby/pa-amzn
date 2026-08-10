import { describe, it, expect } from "vitest";
// Plain .mjs on purpose: shared with scripts/pacr/*.mjs so the gate and guard cannot drift.
import { checkIntent, canonical, WEIGHT_LINE_G, TITLE_MAX } from "./pacr-rules.mjs";

/** A candidate that passes everything, so each test can break exactly one thing. */
const good = (over: Record<string, unknown> = {}) => ({
  surface: "amazon-secondary",
  product: "PRO",
  asset_type: "image",
  template_id: "compat-table",
  product_visible: true,
  source_assets: [{ id: "d1", name: "Final Pro Clip Images/Image 1.jpg", provenance: "own-photo" }],
  headline: "Built for heavier phones",
  body: ["Over 171 g? That is the Pro."],
  alt_text: "Phone Assured Pro retractable phone tether clipped to a belt loop",
  size: "2500x2500",
  ...over,
});

const rules = (r: { failures: { rule: string }[] }) => r.failures.map((f) => f.rule);

describe("PACR gate - a clean candidate passes", () => {
  it("passes a real Pro secondary image built from our own photography", () => {
    const r = checkIntent(good());
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("PACR 1/2/6 - the product must be real and visible", () => {
  it("blocks an asset with no product in frame", () => {
    expect(rules(checkIntent(good({ product_visible: false })))).toContain("PACR 1");
  });
  it("blocks AI-generated product imagery", () => {
    const r = checkIntent(good({ source_assets: [{ id: "x", name: "hero", provenance: "ai-generated" }] }));
    expect(rules(r)).toContain("PACR 2");
  });
  it("blocks a source with no declared provenance", () => {
    const r = checkIntent(good({ source_assets: [{ id: "x", name: "rooftop", provenance: "unknown" }] }));
    expect(rules(r)).toContain("PACR 6");
  });
  it("blocks an asset with no sources at all", () => {
    expect(rules(checkIntent(good({ source_assets: [] })))).toContain("PACR 2");
  });
});

describe("PACR 3 - show the catch, never the climb", () => {
  it("blocks a phone being hauled up by the cord", () => {
    expect(rules(checkIntent(good({ shows_phone_hauled_up: true })))).toContain("PACR 3");
  });
});

describe("PACR 4/48 - testimonials are off-Amazon only, and must be real", () => {
  it("blocks review language on an Amazon surface", () => {
    expect(rules(checkIntent(good({ body: ["Over 100,000 happy customers"] })))).toContain("PACR 4");
  });
  it("blocks a star rating on an Amazon surface", () => {
    expect(rules(checkIntent(good({ body: ["Rated 4.6 stars"] })))).toContain("PACR 4");
  });
  it("allows the same wording off Amazon", () => {
    const r = checkIntent(good({ surface: "social-feed", body: ["Verified Purchase"] }));
    expect(rules(r)).not.toContain("PACR 4");
  });
  it("blocks an AI-generated testimonial as a fake review", () => {
    const r = checkIntent(good({
      surface: "social-feed",
      testimonial: { person: "not real", real: false, ai_generated: true, consent: false },
    }));
    expect(rules(r)).toContain("PACR 48");
  });
  it("blocks a real testimonial with no recorded consent", () => {
    const r = checkIntent(good({
      surface: "social-feed",
      testimonial: { person: "Paul Arnoldi", real: true, ai_generated: false, consent: false },
    }));
    expect(rules(r)).toContain("PACR 48");
  });
  it("blocks an undisclosed material connection", () => {
    const r = checkIntent(good({
      surface: "social-feed",
      testimonial: { person: "Paul Arnoldi", real: true, ai_generated: false, consent: true, material_connection: "free product" },
    }));
    expect(rules(r)).toContain("PACR 48");
  });
  it("passes Paul with consent and the connection disclosed", () => {
    const r = checkIntent(good({
      surface: "social-feed",
      testimonial: { person: "Paul Arnoldi", real: true, ai_generated: false, consent: true, material_connection: "free product", disclosed: true },
    }));
    expect(r.failures).toEqual([]);
  });
  it("still refuses Paul on an Amazon surface even when everything else is right", () => {
    const r = checkIntent(good({
      testimonial: { person: "Paul Arnoldi", real: true, ai_generated: false, consent: true, disclosed: true },
    }));
    expect(rules(r)).toContain("PACR 4");
  });
});

describe("PACR 5/15 - the title rules", () => {
  it("blocks warranty wording in the title", () => {
    const r = checkIntent(good({ surface: "amazon-title", title: "Phone Tether with Lifetime Guarantee", alt_text: "x" }));
    expect(rules(r)).toContain("PACR 5");
  });
  it(`blocks a title over ${TITLE_MAX} characters`, () => {
    const r = checkIntent(good({ surface: "amazon-title", title: "P".repeat(TITLE_MAX + 1), alt_text: "x" }));
    expect(rules(r)).toContain("PACR 15");
  });
});

describe("PACR 7/8 - tone", () => {
  it("blocks fear-based copy", () => {
    expect(rules(checkIntent(good({ headline: "Do not get robbed" })))).toContain("PACR 7");
  });
  it("blocks an em dash", () => {
    expect(rules(checkIntent(good({ headline: "Strong — and light" })))).toContain("PACR 8");
  });
  it("blocks AI-sounding copy", () => {
    expect(rules(checkIntent(good({ headline: "Elevate your everyday carry" })))).toContain("PACR 8");
  });
});

describe("PACR 10/11 - the Amazon main image", () => {
  const main = (over = {}) => good({ surface: "amazon-main", headline: "", body: [], background: "pure-white", template_id: "packshot", ...over });
  it("passes a clean packshot on pure white", () => {
    expect(checkIntent(main()).failures).toEqual([]);
  });
  it("blocks the live main image, which burns 1-PACK onto the phone", () => {
    expect(rules(checkIntent(main({ body: ["1-PACK"] })))).toContain("PACR 10");
  });
  it("blocks BEST VALUE, which the live 3-pack main image carries", () => {
    expect(rules(checkIntent(main({ body: ["3-PACK BEST VALUE"] })))).toContain("PACR 10");
  });
  it("blocks a non-white main background", () => {
    expect(rules(checkIntent(main({ background: "dark" })))).toContain("PACR 10");
  });
  it("blocks an Amazon image under 2000px", () => {
    expect(rules(checkIntent(good({ size: "970x600" })))).toContain("PACR 11");
  });
});

describe("PACR 43 - the wristband and necklace are gone", () => {
  it("blocks the discontinued line in copy", () => {
    const r = checkIntent(good({ body: ["Neck and wrist lanyard included"] }));
    expect(rules(r)).toContain("PACR 43");
  });
  it("blocks 3M adhesive tabs", () => {
    expect(rules(checkIntent(good({ body: ["With 3M adhesive tabs"] })))).toContain("PACR 43");
  });
  it("blocks a source file from the lanyard shoot", () => {
    const r = checkIntent(good({ source_assets: [{ id: "x", name: "Final Lanyard Images/03.jpg", provenance: "own-photo" }] }));
    expect(rules(r)).toContain("PACR 43");
  });
  it("blocks a product that no longer exists", () => {
    expect(rules(checkIntent(good({ product: "NECKLACE" })))).toContain("PACR 43");
  });
});

describe("PACR 44 - no strength number until it is measured", () => {
  it("blocks an invented load figure", () => {
    const r = checkIntent(good({ body: ["Holds up to 15 oz"] }));
    expect(rules(r)).toContain("PACR 44");
  });
  it("blocks a retraction figure phrased the other way round", () => {
    const r = checkIntent(good({ body: ["10 oz auto retraction"] }));
    expect(rules(r)).toContain("PACR 44");
  });
  it("allows it once the measurement is on record", () => {
    const r = checkIntent(good({ body: ["Holds up to 15 oz"] }), { strengthVerified: true });
    expect(rules(r)).not.toContain("PACR 44");
  });
});

describe("PACR 45 - the weight line, and what we may not claim", () => {
  it(`accepts the ${WEIGHT_LINE_G} g line`, () => {
    expect(checkIntent(good({ body: ["Over 171 g? That is the Pro."] })).failures).toEqual([]);
  });
  it('blocks "tested with" across a phone list', () => {
    const r = checkIntent(good({ body: ["Tested with iPhone, Galaxy and Pixel"] }));
    expect(rules(r)).toContain("PACR 45");
  });
  it("warns when a different weight sneaks into the copy", () => {
    const r = checkIntent(good({ body: ["Works with phones under 200 g"] }));
    expect(r.warnings.map((w: { rule: string }) => w.rule)).toContain("PACR 45");
  });
});

describe("PACR 46/47 - video", () => {
  const vid = (over = {}) => good({ asset_type: "video", surface: "social-feed", hook_seconds: 2, captions: true, size: "1080x1920", ...over });
  it("passes a captioned clip that shows the product in 2s", () => {
    expect(checkIntent(vid()).failures).toEqual([]);
  });
  it("blocks Paul's 72s cut, where the product never appears in the hook", () => {
    expect(rules(checkIntent(vid({ hook_seconds: 72 })))).toContain("PACR 46");
  });
  it("blocks an uncaptioned video", () => {
    expect(rules(checkIntent(vid({ captions: false })))).toContain("PACR 47");
  });
});

describe("PACR 49 - alt text, the rule Hebrew got past", () => {
  it("blocks missing alt text on an Amazon surface", () => {
    expect(rules(checkIntent(good({ alt_text: "" })))).toContain("PACR 49");
  });
  it("blocks the Hebrew alt text that is live today", () => {
    expect(rules(checkIntent(good({ alt_text: "קשירת טלפון" })))).toContain("PACR 49");
  });
  it("blocks the Spanish alt text in the 2026 draft", () => {
    expect(rules(checkIntent(good({ alt_text: "Correa de teléfono" })))).toContain("PACR 49");
  });
});

describe("PACR 50 - do not repeat a layout", () => {
  it("blocks a template used in the last six assets", () => {
    const r = checkIntent(good(), { recentTemplates: ["packshot", "compat-table", "install"] });
    expect(rules(r)).toContain("PACR 50");
  });
  it("allows it once it has fallen out of the window", () => {
    const r = checkIntent(good(), { recentTemplates: ["a", "b", "c", "d", "e", "f", "compat-table"] });
    expect(rules(r)).not.toContain("PACR 50");
  });
});

describe("canonical() - the gate and the guard must agree byte for byte", () => {
  it("is stable regardless of key order", () => {
    const a = canonical({ surface: "site", product: "PRO", headline: "x" });
    const b = canonical({ headline: "x", product: "PRO", surface: "site" });
    expect(a).toBe(b);
  });
  it("changes when a gate-relevant field changes", () => {
    expect(canonical(good())).not.toBe(canonical(good({ headline: "Different" })));
  });
  it("ignores fields outside the canonical set, so notes do not invalidate a token", () => {
    expect(canonical(good())).toBe(canonical(good({ note: "reviewed with Megan" })));
  });
});
