/**
 * Fixture-based integration tests for the `workspace/*` catalog.
 *
 * Each fixture directory under `__fixtures__/workspaces/<case>/` contains a
 * `case.json` describing the seed `WorkspaceState` (settings, lockfile,
 * paths, listings, detected agents) and the expected findings. The runner
 * seeds the `WorkspaceState`, evaluates the full `workspaceRules` catalog,
 * and asserts that each expected finding's `(ruleId, severity, file)`
 * triple is present. The total finding count must match.
 *
 * Autofixing fixtures with an `expectedAfterFix` field additionally apply
 * the rule's Operations via `applyOperationIntent` and assert the
 * post-apply catalog finding list matches.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { platformCanonicalLintConfig } from "../config.js";
import { evaluateContexts, type Evaluated } from "../evaluate.js";
import type { LintFinding, LintRule } from "../rule.js";
import type { WorkspaceRuleContext } from "../context.js";
import { workspaceRules } from "./workspace.js";
import { applyOperationIntent } from "./workspace-accessor/interpret-ops.js";
import {
  emptyWorkspaceState,
  makeStateBackedWorkspaceLintAccessor,
  type WorkspaceState,
} from "./workspace-accessor/test-state.js";
import type { AgentId } from "../../agents/types.js";

// -----------------------------------------------------------------------------
// Case shape
// -----------------------------------------------------------------------------

interface ExpectedFinding {
  readonly ruleId: string;
  readonly severity: "error" | "warning" | "info";
  readonly file: string;
  readonly messageIncludes?: string;
}

interface RawCaseState {
  readonly settings?: unknown;
  readonly lockfile?: unknown;
  readonly existingPaths?: ReadonlyArray<string>;
  readonly writablePaths?: ReadonlyArray<string>;
  readonly listings?: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly detectedProjectAgents?: ReadonlyArray<string>;
}

interface FixtureCase {
  readonly description: string;
  readonly state: RawCaseState;
  readonly scope: "project" | "user";
  readonly expectedFindings: ReadonlyArray<ExpectedFinding>;
  readonly expectedAfterFix?: ReadonlyArray<ExpectedFinding>;
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

const FIXTURES_ROOT = nodePath.resolve(__dirname, "..", "__fixtures__", "workspaces");

const listCases = (): ReadonlyArray<string> =>
  nodeFs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

const loadCase = (name: string): FixtureCase => {
  const dir = nodePath.join(FIXTURES_ROOT, name);
  const raw = nodeFs.readFileSync(nodePath.join(dir, "case.json"), "utf8");
  return JSON.parse(raw) as FixtureCase;
};

const seedState = (raw: RawCaseState): WorkspaceState => {
  const state = emptyWorkspaceState();
  state.settings = raw.settings;
  state.lockfile = raw.lockfile;
  for (const path of raw.existingPaths ?? []) {
    state.existingPaths.add(path);
  }
  for (const path of raw.writablePaths ?? []) {
    state.writablePaths.add(path);
  }
  for (const [key, value] of Object.entries(raw.listings ?? {})) {
    state.listings.set(key, [...value]);
  }
  for (const agentId of raw.detectedProjectAgents ?? []) {
    state.detectedProjectAgents.add(agentId as AgentId);
  }
  return state;
};

const contextFor = (state: WorkspaceState, scope: "project" | "user"): WorkspaceRuleContext => ({
  subject: { root: "/tmp/ws", scope },
  workspace: makeStateBackedWorkspaceLintAccessor(state),
  displayRoot: "",
});

const assertFindingsMatch = (
  actual: ReadonlyArray<LintFinding>,
  expected: ReadonlyArray<ExpectedFinding>,
  caseName: string,
): void => {
  if (actual.length !== expected.length) {
    throw new Error(
      `case ${caseName}: expected ${expected.length} findings, got ${actual.length}\n` +
        `Actual:\n${JSON.stringify(actual, null, 2)}\n` +
        `Expected:\n${JSON.stringify(expected, null, 2)}`,
    );
  }
  for (const exp of expected) {
    const match = actual.find(
      (f) =>
        f.ruleId === exp.ruleId &&
        f.severity === exp.severity &&
        f.location?.file === exp.file &&
        (exp.messageIncludes === undefined ? true : f.message.includes(exp.messageIncludes)),
    );
    if (match === undefined) {
      throw new Error(
        `Expected finding not found for case ${caseName}: ${JSON.stringify(exp)}; actual findings: ${JSON.stringify(actual, null, 2)}`,
      );
    }
  }
};

// -----------------------------------------------------------------------------
// Runner
// -----------------------------------------------------------------------------

describe("workspace catalog — fixtures", () => {
  for (const caseName of listCases()) {
    const fixture = loadCase(caseName);
    it.effect(`${caseName}: ${fixture.description}`, () =>
      Effect.gen(function* () {
        const state = seedState(fixture.state);
        const ctx = contextFor(state, fixture.scope);

        const evaluated = yield* evaluateContexts(
          workspaceRules as ReadonlyArray<LintRule<WorkspaceRuleContext>>,
          [ctx],
          platformCanonicalLintConfig,
        );
        const preFindings = evaluated.flatMap((e: Evaluated<WorkspaceRuleContext>) => e.findings);
        assertFindingsMatch(preFindings, fixture.expectedFindings, caseName);

        if (fixture.expectedAfterFix === undefined) {
          return;
        }

        // Apply autofixes and re-run the full catalog.
        for (const e of evaluated) {
          if (e.rule.kind !== "autofixing") {
            continue;
          }
          for (const finding of e.findings) {
            if (finding.kind !== "autofixable") {
              continue;
            }
            const ops = yield* e.rule.fix(ctx, finding);
            for (const op of ops) {
              applyOperationIntent(state, op);
            }
          }
        }
        const ctx2 = contextFor(state, fixture.scope);
        const evaluated2 = yield* evaluateContexts(
          workspaceRules as ReadonlyArray<LintRule<WorkspaceRuleContext>>,
          [ctx2],
          platformCanonicalLintConfig,
        );
        const postFindings = evaluated2.flatMap((e: Evaluated<WorkspaceRuleContext>) => e.findings);
        assertFindingsMatch(postFindings, fixture.expectedAfterFix, caseName);
      }),
    );
  }
});
