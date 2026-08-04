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
import type { InstalledExtensionManifest, WorkspaceRuleContext } from "../context.js";
import { workspaceRules } from "./workspace.js";
import {
  applyOperationIntent,
  emptyWorkspaceState,
  type WorkspaceState,
} from "./workspace-fixtures/interpret-ops.js";
import type { AgentId } from "../../agents/types.js";
import { makeWorkspaceReadModel } from "../../workspace/read-model/service.js";
import { type FixtureSpec } from "../../workspace/read-model/__fixtures__/builder.js";
import { WorkspaceReadModelTest } from "../../workspace/read-model/__fixtures__/test-layer.js";
import { fixtureSpecFromWorkspaceState } from "./workspace-fixtures/fixture-state.js";

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
  /**
   * Seeds `context.installedExtensions`. The real projection reads these off
   * disk in `buildLintWorkspace`; fixtures declare them directly, the same way
   * `settings` and `lockfile` are declared rather than parsed from files.
   */
  readonly installedExtensions?: ReadonlyArray<InstalledExtensionManifest>;
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

const FIXTURE_PROJECT_ROOT = "/tmp/ws";
const FIXTURE_USER_HOME = "/tmp/ws-user";

const fixtureSpecFor = (state: WorkspaceState, scope: "project" | "user"): FixtureSpec => {
  return fixtureSpecFromWorkspaceState(state, scope, {
    workspaceRoot: FIXTURE_PROJECT_ROOT,
    userHome: FIXTURE_USER_HOME,
  });
};

const buildContext = (
  state: WorkspaceState,
  scope: "project" | "user",
  installedExtensions: ReadonlyArray<InstalledExtensionManifest>,
) =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel(scope);
    // Annotated rather than `satisfies` so the inferred type stays the wide
    // `WorkspaceRuleContext` the catalog's rules are generic over.
    const context: WorkspaceRuleContext = {
      subject: { root: FIXTURE_PROJECT_ROOT, scope },
      workspace,
      axmDirExists: Effect.succeed(state.existingPaths.has(".axm")),
      installedExtensions: { manifests: Effect.succeed(installedExtensions) },
      displayRoot: "",
    };
    return context;
  }).pipe(Effect.provide(WorkspaceReadModelTest(fixtureSpecFor(state, scope))));

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
        const installedExtensions = fixture.state.installedExtensions ?? [];
        const ctx = yield* buildContext(state, fixture.scope, installedExtensions);

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
        const ctx2 = yield* buildContext(state, fixture.scope, installedExtensions);
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
