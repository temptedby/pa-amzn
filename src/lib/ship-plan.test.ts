import { describe, it, expect } from "vitest";
import {
  isTrivialConflictPath,
  classifyConflict,
  collapseStacks,
  codeFileOverlap,
  type BranchInfo,
} from "./ship-plan";

describe("isTrivialConflictPath", () => {
  it("treats the append-only docs as trivial", () => {
    expect(isTrivialConflictPath("decisions-journal.md")).toBe(true);
    expect(isTrivialConflictPath(".agent/TASKS.md")).toBe(true);
    expect(isTrivialConflictPath("confabulator/daily-summaries/2026-06-30.md")).toBe(true);
  });
  it("treats source + config as real code conflicts", () => {
    expect(isTrivialConflictPath("src/lib/amazon/ad-engine.ts")).toBe(false);
    expect(isTrivialConflictPath("vercel.json")).toBe(false);
    expect(isTrivialConflictPath("confabulator/margin-model-2026-06-29.md")).toBe(false);
  });
});

describe("classifyConflict", () => {
  it("clean when nothing conflicts", () => {
    expect(classifyConflict([]).verdict).toBe("clean");
  });
  it("doc-only when only append-docs conflict", () => {
    const c = classifyConflict(["decisions-journal.md", ".agent/TASKS.md"]);
    expect(c.verdict).toBe("doc-only");
    expect(c.codeConflicts).toEqual([]);
    expect(c.docConflicts).toHaveLength(2);
  });
  it("code when any source file conflicts (even alongside docs)", () => {
    const c = classifyConflict(["decisions-journal.md", "src/lib/amazon/ad-engine.ts"]);
    expect(c.verdict).toBe("code");
    expect(c.codeConflicts).toEqual(["src/lib/amazon/ad-engine.ts"]);
    expect(c.docConflicts).toEqual(["decisions-journal.md"]);
  });
});

// Build a small fake ancestry: B stacks on A (B contains A.head); C is independent.
function mk(name: string, head: string, own: string[], files: string[], ahead: number): BranchInfo {
  return { name, head, ownCommits: new Set(own), files, date: "2026-06-30", ahead };
}

describe("collapseStacks", () => {
  it("collapses a stack to its tip and lists what it subsumes", () => {
    const A = mk("A", "a1", ["a1"], ["src/a.ts"], 1);
    const B = mk("B", "b1", ["a1", "b1"], ["src/a.ts", "src/b.ts"], 2); // contains A.head
    const C = mk("C", "c1", ["c1"], ["src/c.ts"], 1); // independent
    const units = collapseStacks([A, B, C]);
    const tips = units.map((u) => u.tip).sort();
    expect(tips).toEqual(["B", "C"]); // A is subsumed by B
    const bUnit = units.find((u) => u.tip === "B")!;
    expect(bUnit.subsumes).toEqual(["A"]);
  });
  it("keeps two independent branches as separate units", () => {
    const X = mk("X", "x1", ["x1"], ["src/x.ts"], 1);
    const Y = mk("Y", "y1", ["y1"], ["src/y.ts"], 1);
    expect(collapseStacks([X, Y]).map((u) => u.tip).sort()).toEqual(["X", "Y"]);
  });
});

describe("codeFileOverlap", () => {
  it("flags a code file two units both touch, ignoring trivial docs", () => {
    const A = mk("A", "a1", ["a1"], ["src/lib/amazon/ad-engine.ts", "decisions-journal.md"], 1);
    const B = mk("B", "b1", ["b1"], ["src/lib/amazon/ad-engine.ts", "decisions-journal.md"], 1);
    const overlap = codeFileOverlap(collapseStacks([A, B]));
    expect(overlap.get("src/lib/amazon/ad-engine.ts")).toEqual(["A", "B"]);
    expect(overlap.has("decisions-journal.md")).toBe(false); // trivial, never flagged
  });
  it("no overlap when units touch disjoint files", () => {
    const A = mk("A", "a1", ["a1"], ["src/a.ts"], 1);
    const B = mk("B", "b1", ["b1"], ["src/b.ts"], 1);
    expect(codeFileOverlap(collapseStacks([A, B])).size).toBe(0);
  });
});

// --- merge runbook ----------------------------------------------------------
import {
  buildMergeRunbook,
  UNION_DRIVER_FRAGMENT,
  type RunbookUnit,
} from "./ship-plan";

/** Build a RunbookUnit directly (the script attaches verdict from a trial-merge). */
function ru(
  tip: string,
  verdict: "clean" | "doc-only" | "code",
  files: string[],
  opts: { ahead?: number; date?: string; code?: string[]; docs?: string[] } = {},
): RunbookUnit {
  return {
    tip,
    subsumes: [],
    files,
    date: opts.date ?? "2026-06-29",
    ahead: opts.ahead ?? 1,
    verdict,
    codeConflicts: opts.code ?? [],
    docConflicts: opts.docs ?? [],
  };
}

describe("buildMergeRunbook", () => {
  it("auto-merges clean collision-free units, each gated by a test run", () => {
    const A = ru("featA", "clean", ["src/a.ts"]);
    const B = ru("featB", "clean", ["src/b.ts"]);
    const overlap = codeFileOverlap(collapseStacks([] as BranchInfo[])); // empty
    const rb = buildMergeRunbook([A, B], overlap);
    const merges = rb.autoSteps.filter((s) => s.kind === "merge").map((s) => s.tip);
    expect(merges).toEqual(["featA", "featB"]);
    // every merge is followed by a test gate
    expect(rb.autoSteps.filter((s) => s.kind === "test")).toHaveLength(2);
    expect(rb.clusters).toEqual([]);
  });

  it("activates .gitattributes (prep) BEFORE merging the union driver, so phase-0 doesn't halt", () => {
    const driver = ru(`chore/${UNION_DRIVER_FRAGMENT}-2026-06-28`, "doc-only", [".gitattributes", ".agent/TASKS.md"], {
      docs: [".agent/TASKS.md"],
    });
    const rb = buildMergeRunbook([driver], new Map());
    const phase0 = rb.autoSteps.filter((s) => s.phase === "0 union driver");
    // order must be: prep (copy+commit .gitattributes) -> merge -> test
    expect(phase0.map((s) => s.kind)).toEqual(["prep", "merge", "test"]);
    const prep = phase0[0];
    expect(prep.command).toContain(`git checkout ${driver.tip} -- .gitattributes`);
    expect(prep.command).toContain("git add .gitattributes");
    expect(prep.command).toContain("git commit");
    // the merge of the driver branch still happens, AFTER the prep
    expect(phase0[1].command).toBe(`git merge --no-ff ${driver.tip}`);
  });

  it("emits NO prep step when there is no union-driver branch", () => {
    const doc = ru("audit/x", "doc-only", ["decisions-journal.md"], { docs: ["decisions-journal.md"] });
    const rb = buildMergeRunbook([doc], new Map());
    expect(rb.unionDriverTip).toBeNull();
    expect(rb.autoSteps.some((s) => s.kind === "prep")).toBe(false);
  });

  it("lands the union driver FIRST, then the doc-only units", () => {
    const driver = ru(`chore/${UNION_DRIVER_FRAGMENT}-2026-06-28`, "doc-only", [".agent/TASKS.md"], {
      docs: [".agent/TASKS.md"],
    });
    const doc = ru("audit/x", "doc-only", ["decisions-journal.md"], { docs: ["decisions-journal.md"] });
    const rb = buildMergeRunbook([doc, driver], new Map());
    expect(rb.unionDriverTip).toBe(driver.tip);
    const mergeOrder = rb.autoSteps.filter((s) => s.kind === "merge").map((s) => s.tip);
    expect(mergeOrder[0]).toBe(driver.tip); // driver before any doc-only
    expect(mergeOrder).toContain("audit/x");
  });

  it("never auto-merges code-colliding units — they become a manual cluster", () => {
    const A = ru("featA", "clean", ["src/lib/amazon/ad-engine.ts"], { ahead: 4 });
    const B = ru("featB", "code", ["src/lib/amazon/ad-engine.ts"], {
      ahead: 2,
      code: ["src/lib/amazon/ad-engine.ts"],
    });
    const overlap = new Map([["src/lib/amazon/ad-engine.ts", ["featA", "featB"]]]);
    const rb = buildMergeRunbook([A, B], overlap);
    // neither colliding tip appears in the auto (executable) steps
    expect(rb.autoSteps.some((s) => s.tip === "featA" || s.tip === "featB")).toBe(false);
    expect(rb.clusters).toHaveLength(1);
    expect(rb.clusters[0].members).toEqual(["featA", "featB"]);
    expect(rb.clusters[0].files).toEqual(["src/lib/amazon/ad-engine.ts"]);
    // most-ahead tip is recommended to land first (others rebase onto it)
    expect(rb.clusters[0].recommendFirst).toBe("featA");
  });

  it("groups a transitive collision chain into ONE cluster (connected component)", () => {
    // A-B share file1, B-C share file2 => {A,B,C} one cluster even though A,C are disjoint
    const A = ru("A", "clean", ["f1.ts"], { ahead: 1 });
    const B = ru("B", "code", ["f1.ts", "f2.ts"], { ahead: 3, code: ["f1.ts"] });
    const C = ru("C", "clean", ["f2.ts"], { ahead: 1 });
    const overlap = new Map([
      ["f1.ts", ["A", "B"]],
      ["f2.ts", ["B", "C"]],
    ]);
    const rb = buildMergeRunbook([A, B, C], overlap);
    expect(rb.clusters).toHaveLength(1);
    expect(rb.clusters[0].members).toEqual(["A", "B", "C"]);
    expect(rb.clusters[0].files).toEqual(["f1.ts", "f2.ts"]);
    expect(rb.clusters[0].recommendFirst).toBe("B"); // most ahead
  });

  it("tie-breaks recommendFirst by oldest date when ahead is equal", () => {
    const A = ru("A", "clean", ["f.ts"], { ahead: 2, date: "2026-06-29" });
    const B = ru("B", "clean", ["f.ts"], { ahead: 2, date: "2026-06-25" });
    const overlap = new Map([["f.ts", ["A", "B"]]]);
    const rb = buildMergeRunbook([A, B], overlap);
    expect(rb.clusters[0].recommendFirst).toBe("B"); // older
  });
});
