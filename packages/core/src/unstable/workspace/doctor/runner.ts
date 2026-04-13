import * as Effect from "effect/Effect";
import { Workspace } from "../service-interface.js";
import { FINDING_ID_PATTERN, matchesCheckIdPrefix, type CheckDef } from "./check-def.js";
import { rollupFindings, summarize } from "./rollup.js";
import type { Check, Finding, WorkspaceDoctorReport } from "./types.js";

// ---------------------------------------------------------------------------
// Graph validation
// ---------------------------------------------------------------------------

type GraphError =
  | { readonly kind: "missing"; readonly checkId: string; readonly missingId: string }
  | { readonly kind: "cycle"; readonly remaining: ReadonlyArray<string> };

const validateGraph = <Deps>(checks: ReadonlyArray<CheckDef<Deps>>): GraphError | undefined => {
  const ids = new Set(checks.map((c) => c.id));

  for (const check of checks) {
    for (const depId of check.dependsOn) {
      if (!ids.has(depId)) {
        return { kind: "missing", checkId: check.id, missingId: depId };
      }
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const depsOf = new Map<string, ReadonlyArray<string>>();
  for (const c of checks) {
    color.set(c.id, WHITE);
    depsOf.set(c.id, c.dependsOn);
  }

  const hasCycleFrom = (id: string): boolean => {
    color.set(id, GRAY);
    for (const depId of depsOf.get(id) ?? []) {
      const depColor = color.get(depId) ?? BLACK;
      if (depColor === GRAY) return true;
      if (depColor === WHITE && hasCycleFrom(depId)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const check of checks) {
    if (color.get(check.id) === WHITE && hasCycleFrom(check.id)) {
      const remaining = [...color.entries()].filter(([, c]) => c !== BLACK).map(([id]) => id);
      return { kind: "cycle", remaining };
    }
  }

  return undefined;
};

// ---------------------------------------------------------------------------
// Level computation (groups of independent checks for concurrent execution)
// ---------------------------------------------------------------------------

const computeLevels = <Deps>(
  checks: ReadonlyArray<CheckDef<Deps>>,
): ReadonlyArray<ReadonlyArray<CheckDef<Deps>>> => {
  const byId = new Map<string, CheckDef<Deps>>();
  const registrationIndex = new Map<string, number>();
  for (const [i, check] of checks.entries()) {
    byId.set(check.id, check);
    registrationIndex.set(check.id, i);
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, Array<string>>();

  for (const check of checks) {
    inDegree.set(check.id, check.dependsOn.length);
    for (const depId of check.dependsOn) {
      const list = dependents.get(depId);
      if (list === undefined) {
        dependents.set(depId, [check.id]);
      } else {
        list.push(check.id);
      }
    }
  }

  let ready = checks.filter((c) => (inDegree.get(c.id) ?? 0) === 0).map((c) => c.id);

  const levels: Array<ReadonlyArray<CheckDef<Deps>>> = [];

  while (ready.length > 0) {
    const sorted = [...ready].sort(
      (a, b) => (registrationIndex.get(a) ?? 0) - (registrationIndex.get(b) ?? 0),
    );

    levels.push(
      sorted.map((id) => byId.get(id)).filter((c): c is CheckDef<Deps> => c !== undefined),
    );

    const nextReady: Array<string> = [];
    for (const id of sorted) {
      for (const dependentId of dependents.get(id) ?? []) {
        const updated = (inDegree.get(dependentId) ?? 0) - 1;
        inDegree.set(dependentId, updated);
        if (updated === 0) {
          nextReady.push(dependentId);
        }
      }
    }
    ready = nextReady;
  }

  return levels;
};

// ---------------------------------------------------------------------------
// Finding sanitization
// ---------------------------------------------------------------------------

const sanitizeFindings = (
  checkId: string,
  findings: ReadonlyArray<Finding>,
): ReadonlyArray<Finding> =>
  findings.map((finding) => {
    const idIsValid =
      FINDING_ID_PATTERN.test(finding.id) && matchesCheckIdPrefix(finding.id, checkId);
    if (idIsValid) {
      return finding;
    }
    return {
      id: `${checkId}.invalid-finding-id`,
      severity: "error",
      message: `Diagnostic emitted a finding with an invalid id: "${finding.id}". Finding ids must match the pattern "<check-id>.<kebab-suffix>".`,
    } satisfies Finding;
  });

// ---------------------------------------------------------------------------
// Single check execution
// ---------------------------------------------------------------------------

const runOneCheck = <Deps>(
  check: CheckDef<Deps>,
  rootFailureTitles: ReadonlyMap<string, string>,
): Effect.Effect<Check, never, Deps> =>
  Effect.gen(function* () {
    for (const depId of check.dependsOn) {
      const rootTitle = rootFailureTitles.get(depId);
      if (rootTitle !== undefined) {
        return {
          id: check.id,
          title: check.title,
          description: check.description,
          dependsOn: check.dependsOn,
          status: "skip",
          skipReason: `Depends on "${rootTitle}", which failed.`,
          findings: [],
        } satisfies Check;
      }
    }

    const diagnosticResults = yield* check.runDiagnostics;
    const findings = sanitizeFindings(
      check.id,
      diagnosticResults.flatMap((r) => r.findings),
    );
    const status = rollupFindings(findings);

    return {
      id: check.id,
      title: check.title,
      description: check.description,
      dependsOn: check.dependsOn,
      status,
      findings,
    } satisfies Check;
  });

// ---------------------------------------------------------------------------
// Check graph execution
// ---------------------------------------------------------------------------

interface LevelState {
  readonly results: ReadonlyMap<string, Check>;
  readonly rootFailureTitles: ReadonlyMap<string, string>;
}

const processLevel = <Deps>(
  level: ReadonlyArray<CheckDef<Deps>>,
  state: LevelState,
): Effect.Effect<LevelState, never, Deps> =>
  Effect.map(
    Effect.all(
      level.map((check) =>
        Effect.map(runOneCheck(check, state.rootFailureTitles), (result) => ({ check, result })),
      ),
      { concurrency: "unbounded" },
    ),
    (pairs) => {
      const nextResults = new Map(state.results);
      const nextRootFailureTitles = new Map(state.rootFailureTitles);

      for (const { check, result } of pairs) {
        nextResults.set(check.id, result);
        if (result.status === "fail") {
          nextRootFailureTitles.set(check.id, check.title);
        } else if (result.status === "skip") {
          for (const depId of check.dependsOn) {
            const inherited = nextRootFailureTitles.get(depId);
            if (inherited !== undefined) {
              nextRootFailureTitles.set(check.id, inherited);
              break;
            }
          }
        }
      }

      return { results: nextResults, rootFailureTitles: nextRootFailureTitles };
    },
  );

export const runCheckGraph = <Deps>(
  checks: ReadonlyArray<CheckDef<Deps>>,
): Effect.Effect<WorkspaceDoctorReport, never, Deps | Workspace> =>
  Effect.gen(function* () {
    const error = validateGraph(checks);
    if (error?.kind === "missing") {
      return yield* Effect.die(
        new Error(
          `doctor check "${error.checkId}" declares missing dependency "${error.missingId}"`,
        ),
      );
    }
    if (error?.kind === "cycle") {
      return yield* Effect.die(
        new Error(`doctor check graph contains a cycle among: ${error.remaining.join(", ")}`),
      );
    }

    const levels = computeLevels(checks);

    // Levels are dependent (each depends on prior results), so sequential iteration is correct.
    // Within each level, checks run concurrently via Effect.all.
    let state: LevelState = {
      results: new Map<string, Check>(),
      rootFailureTitles: new Map<string, string>(),
    };
    for (const level of levels) {
      state = yield* processLevel(level, state);
    }

    const orderedChecks = checks
      .map((check) => state.results.get(check.id))
      .filter((result): result is Check => result !== undefined);

    const summary = summarize(orderedChecks);
    const workspace = yield* Workspace;

    return {
      scope: workspace.scope,
      workspacePath: workspace.path,
      healthy: summary.findings.errors === 0,
      summary,
      checks: orderedChecks,
    } satisfies WorkspaceDoctorReport;
  });
