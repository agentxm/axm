import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";

import type { AdvisoryFinding, LintRule } from "@agentxm/extension-content/lint";
import * as Option from "effect/Option";
import { buildDesiredStateGraph, makeWorkspaceReadModel } from "../../../../desired-state/index.js";
import type { PackManifestsPort } from "../../../../desired-state/workspace/pack-manifests.js";
import { WorkspaceReadModelTest, type ScopeFiles } from "../../../../desired-state/testing.js";
import type { WorkspaceRuleContext } from "../../../workspace-context.js";

export type WorkspaceContextFixture = () => Effect.Effect<WorkspaceRuleContext>;

export type ExpectedWorkspaceFinding = Omit<AdvisoryFinding, "kind" | "ruleId" | "severity">;

/** Executable satisfied, violated, and optional inapplicable evidence for one rule. */
export interface WorkspaceRuleConformanceCase {
  readonly rule: LintRule<WorkspaceRuleContext, Config.ConfigError>;
  readonly satisfied: WorkspaceContextFixture;
  readonly violated: WorkspaceContextFixture;
  readonly expectedFindings: ReadonlyArray<ExpectedWorkspaceFinding>;
  readonly inapplicable?: WorkspaceContextFixture;
}

export const validLockfile = {
  _tag: "valid" as const,
  contents: { lockfileVersion: 8, skills: {} },
};

export const validSettings = (contents: object = { agents: ["claude-code"] }) => ({
  _tag: "valid" as const,
  contents,
});

/** No Pack manifest is readable in an in-memory fixture; a configured Pack reports as unavailable. */
const noPackManifests: PackManifestsPort = {
  locate: () => ({ path: "", relativePath: "", contents: Effect.succeed(undefined) }),
};

/**
 * Build the real project-scope read model over an in-memory file fixture,
 * with the desired-state graph the fixture's settings and sources build.
 */
export const contextFor = (project: ScopeFiles): Effect.Effect<WorkspaceRuleContext> =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    const desiredState = Effect.gen(function* () {
      const settings = yield* workspace.state.settings;
      const sources = yield* workspace.sourceHosts.declared;
      return yield* buildDesiredStateGraph({
        manifests: noPackManifests,
        baseDir: "/workspace",
        settings: Option.getOrElse(settings, () => ({})),
        registryEndpoints: Object.fromEntries(
          sources.flatMap((source) =>
            source.type === "registry" ? [[source.name, source.location] as const] : [],
          ),
        ),
      });
    });
    return {
      subject: { root: "/workspace", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
      health: { desiredState },
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/workspace",
        userHome: "/home/test",
        project,
      }),
    ),
    Effect.orDie,
  );

/** Add the rule-owned invariant fields to an expected finding description. */
export const completeWorkspaceFindings = (
  testCase: WorkspaceRuleConformanceCase,
): ReadonlyArray<AdvisoryFinding> =>
  testCase.expectedFindings.map((finding) =>
    finding.location === undefined
      ? {
          kind: "advisory",
          ruleId: testCase.rule.id,
          severity: testCase.rule.severity,
          message: finding.message,
        }
      : {
          kind: "advisory",
          ruleId: testCase.rule.id,
          severity: testCase.rule.severity,
          message: finding.message,
          location: finding.location,
        },
  );
