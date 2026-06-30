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

// ---------------------------------------------------------------------------
// Merge runbook — turns the classified units + collision matrix into an ordered,
// test-gated EXECUTION plan (the artifact the hand-written merge-execution-sheet was,
// now regenerable). Auto-merge only the genuinely-independent units; every code
// collision becomes a human "pick one lineage, rebase the rest" cluster (never blind).

/** Name fragment that identifies the merge=union .gitattributes driver branch.
 *  Landing it first makes every doc-only (journal/TASKS) conflict auto-resolve. */
export const UNION_DRIVER_FRAGMENT = "gitattributes-union-merge";

export interface RunbookUnit extends ShipUnit {
  verdict: ConflictVerdict;
  codeConflicts: string[];
  docConflicts: string[];
}

export interface RunbookStep {
  phase: string; // "0 union driver" | "1 clean" | "2 doc-only"
  kind: "merge" | "test";
  tip?: string;
  command: string;
  note?: string;
}

export interface CollisionCluster {
  members: string[]; // tips in the cluster, sorted
  files: string[]; // code files shared within the cluster, sorted
  recommendFirst: string; // land this tip first (most ahead, then oldest, then name)
}

export interface MergeRunbook {
  unionDriverTip: string | null;
  autoSteps: RunbookStep[]; // executable phases 0-2 (independent units only)
  clusters: CollisionCluster[]; // phase 3 — human-decided, never auto-merged
}

const TEST_CMD = "npm test";

/** Build collision adjacency (tip -> set of tips it shares a code file with). */
function collisionGraph(overlap: Map<string, string[]>): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const tips of overlap.values()) {
    for (const a of tips) {
      const s = adj.get(a) ?? new Set<string>();
      for (const b of tips) if (b !== a) s.add(b);
      adj.set(a, s);
    }
  }
  return adj;
}

/** Connected components of the collision graph = the merge clusters that must be
 *  serialized (land one, rebase the rest). */
function collisionClusters(
  overlap: Map<string, string[]>,
  units: RunbookUnit[],
): CollisionCluster[] {
  const adj = collisionGraph(overlap);
  const byTip = new Map(units.map((u) => [u.tip, u]));
  const seen = new Set<string>();
  const clusters: CollisionCluster[] = [];

  for (const start of [...adj.keys()].sort()) {
    if (seen.has(start)) continue;
    // BFS this component
    const members: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const cur = queue.shift()!;
      members.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    const memberSet = new Set(members);
    const files = [...overlap.entries()]
      .filter(([, tips]) => tips.some((t) => memberSet.has(t)))
      .map(([f]) => f)
      .sort();
    // recommend the most-ahead tip (others rebase onto it), tie-break oldest date, then name
    const recommendFirst = [...members]
      .sort((a, b) => {
        const ua = byTip.get(a);
        const ub = byTip.get(b);
        const aheadA = ua?.ahead ?? 0;
        const aheadB = ub?.ahead ?? 0;
        if (aheadA !== aheadB) return aheadB - aheadA;
        const dA = ua?.date ?? "";
        const dB = ub?.date ?? "";
        if (dA !== dB) return dA < dB ? -1 : 1; // oldest first
        return a < b ? -1 : 1;
      })[0];
    clusters.push({ members: members.sort(), files, recommendFirst });
  }
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

export function buildMergeRunbook(
  units: RunbookUnit[],
  overlap: Map<string, string[]>,
): MergeRunbook {
  const adj = collisionGraph(overlap);
  const collides = (tip: string) => (adj.get(tip)?.size ?? 0) > 0;

  const unionDriver = units.find((u) => u.tip.includes(UNION_DRIVER_FRAGMENT));
  const unionDriverTip = unionDriver ? unionDriver.tip : null;

  const autoSteps: RunbookStep[] = [];

  // Phase 0 — land the union driver first so doc-only conflicts auto-resolve.
  if (unionDriver) {
    autoSteps.push({
      phase: "0 union driver",
      kind: "merge",
      tip: unionDriver.tip,
      command: `git merge --no-ff ${unionDriver.tip}`,
      note: "merge=union .gitattributes — makes journal/TASKS re-append conflicts auto-resolve",
    });
    autoSteps.push({ phase: "0 union driver", kind: "test", command: TEST_CMD });
  }

  const orderUnits = (a: RunbookUnit, b: RunbookUnit) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.tip < b.tip ? -1 : 1;

  // Phase 1 — clean AND collision-free: independent, safe to auto-merge.
  const cleanFree = units
    .filter((u) => u.verdict === "clean" && !collides(u.tip) && u.tip !== unionDriverTip)
    .sort(orderUnits);
  for (const u of cleanFree) {
    autoSteps.push({ phase: "1 clean", kind: "merge", tip: u.tip, command: `git merge --no-ff ${u.tip}` });
    autoSteps.push({ phase: "1 clean", kind: "test", command: TEST_CMD });
  }

  // Phase 2 — doc-only AND collision-free: safe once the union driver is in.
  const docFree = units
    .filter((u) => u.verdict === "doc-only" && !collides(u.tip) && u.tip !== unionDriverTip)
    .sort(orderUnits);
  for (const u of docFree) {
    autoSteps.push({
      phase: "2 doc-only",
      kind: "merge",
      tip: u.tip,
      command: `git merge --no-ff ${u.tip}`,
      note: unionDriverTip ? undefined : "no union driver found — resolve journal/TASKS by keeping both sides",
    });
    autoSteps.push({ phase: "2 doc-only", kind: "test", command: TEST_CMD });
  }

  // Phase 3 — everything that collides on code: human-decided clusters.
  const clusters = collisionClusters(overlap, units);

  return { unionDriverTip, autoSteps, clusters };
}
