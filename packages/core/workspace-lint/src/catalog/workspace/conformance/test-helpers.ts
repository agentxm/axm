import * as Effect from "effect/Effect";

import type { AdvisoryFinding, LintRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { makeWorkspaceReadModel } from "@agentxm/workspace-state";
import { WorkspaceReadModelTest, type ScopeFiles } from "@agentxm/workspace-state/testing";
import type { WorkspaceRuleContext } from "../../../workspace-context.js";

export type WorkspaceContextFixture = () => Effect.Effect<WorkspaceRuleContext>;

export type ExpectedWorkspaceFinding = Omit<AdvisoryFinding, "kind" | "ruleId" | "severity">;

/** Executable satisfied, violated, and optional inapplicable evidence for one rule. */
export interface WorkspaceRuleConformanceCase {
  readonly rule: LintRule<WorkspaceRuleContext>;
  readonly satisfied: WorkspaceContextFixture;
  readonly violated: WorkspaceContextFixture;
  readonly expectedFindings: ReadonlyArray<ExpectedWorkspaceFinding>;
  readonly inapplicable?: WorkspaceContextFixture;
}

export const validLockfile = {
  _tag: "valid" as const,
  contents: { lockfileVersion: 7, skills: {} },
};

export const validSettings = (contents: object = { agents: ["claude-code"] }) => ({
  _tag: "valid" as const,
  contents,
});

/** Build the real project-scope read model over an in-memory file fixture. */
export const contextFor = (project: ScopeFiles): Effect.Effect<WorkspaceRuleContext> =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/workspace", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
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
