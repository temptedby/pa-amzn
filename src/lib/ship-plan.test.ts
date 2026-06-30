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
