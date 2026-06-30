// Ship-plan analysis — pure logic for turning a pile of unmerged branches into a
// reviewable merge sequence. No git/IO here; scripts/ship-plan.mjs feeds it git data.
//
// The validated bottleneck (branch-merge-readiness-2026-06-28, decisions-journal):
// many branches, ~none merged, and two families edit ad-engine.ts in conflicting ways.
// This module makes that map regenerable instead of a hand-written doc that goes stale.

/** Files that nearly every autonomous branch appends to — a conflict here is trivial
 *  (re-append on merge), NOT a real code conflict. Matched by prefix or exact path. */
export const TRIVIAL_CONFLICT_PATHS: readonly string[] = [
  "decisions-journal.md",
  ".agent/inbox-handoff-from-bear.md",
  ".agent/TASKS.md",
  ".agent/questions-for-William.md",
  ".agent/backlog.md",
  "confabulator/daily-summaries/",
];

export function isTrivialConflictPath(path: string): boolean {
  return TRIVIAL_CONFLICT_PATHS.some((p) =>
    p.endsWith("/") ? path.startsWith(p) : path === p,
  );
}

export type ConflictVerdict = "clean" | "doc-only" | "code";

export interface ConflictClassification {
  verdict: ConflictVerdict;
  codeConflicts: string[];
  docConflicts: string[];
}

/** Classify a trial-merge's conflicting files. `merged` = the merge was attempted;
 *  pass `conflictFiles=[]` with `merged=true` for a clean merge. */
export function classifyConflict(conflictFiles: string[]): ConflictClassification {
  const docConflicts: string[] = [];
  const codeConflicts: string[] = [];
  for (const f of conflictFiles) {
    (isTrivialConflictPath(f) ? docConflicts : codeConflicts).push(f);
  }
  let verdict: ConflictVerdict;
  if (codeConflicts.length > 0) verdict = "code";
  else if (docConflicts.length > 0) verdict = "doc-only";
  else verdict = "clean";
  return { verdict, codeConflicts, docConflicts };
}

export interface BranchInfo {
  name: string;
  head: string; // commit sha
  /** sha set of `git rev-list main..branch` — the branch's own (post-main) commits. */
  ownCommits: Set<string>;
  files: string[]; // git diff --name-only main...branch
  date: string; // committerdate:short
  ahead: number;
}

export interface ShipUnit {
  tip: string; // tip branch name (merge this one)
  subsumes: string[]; // branches whose head is an ancestor of the tip (no need to merge)
  files: string[];
  date: string;
  ahead: number;
}

/** Collapse ancestry stacks: a branch whose HEAD commit is contained in another branch's
 *  history is subsumed by it. Returns one ShipUnit per tip (a branch subsumed by none). */
export function collapseStacks(branches: BranchInfo[]): ShipUnit[] {
  const byName = new Map(branches.map((b) => [b.name, b]));
  const subsumedBy = new Map<string, string>(); // child -> a tip that contains it

  for (const tip of branches) {
    for (const other of branches) {
      if (tip.name === other.name) continue;
      // other.head is an ancestor of tip iff tip's own-commit set contains it.
      if (tip.ownCommits.has(other.head)) {
        // tip contains other. Prefer the most-ahead container as the representative.
        const prev = subsumedBy.get(other.name);
        if (!prev || (byName.get(tip.name)!.ahead) > (byName.get(prev)!.ahead)) {
          subsumedBy.set(other.name, tip.name);
        }
      }
    }
  }

  const units: ShipUnit[] = [];
  for (const b of branches) {
    if (subsumedBy.has(b.name)) continue; // it's inside someone else's stack
    const subsumes = branches
      .filter((o) => o.name !== b.name && b.ownCommits.has(o.head))
      .map((o) => o.name)
      .sort();
    units.push({ tip: b.name, subsumes, files: b.files, date: b.date, ahead: b.ahead });
  }
  return units.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Code files (non-trivial) touched by more than one ship unit -> cross-unit conflict risk.
 *  Returns a map file -> [unit tips] for every file shared by >=2 units. */
export function codeFileOverlap(units: ShipUnit[]): Map<string, string[]> {
  const fileToUnits = new Map<string, string[]>();
  for (const u of units) {
    for (const f of u.files) {
      if (isTrivialConflictPath(f)) continue;
      const arr = fileToUnits.get(f) ?? [];
      arr.push(u.tip);
      fileToUnits.set(f, arr);
    }
  }
  const overlap = new Map<string, string[]>();
  for (const [f, tips] of fileToUnits) {
    if (tips.length >= 2) overlap.set(f, tips.sort());
  }
  return overlap;
}
