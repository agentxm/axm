import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  configuredButNotInstalledConformance,
  packsDependenciesResolvedConformance,
  skillsArtifactsCorrectConformance,
  skillsIntegrityValidConformance,
  skillsLockfileAlignedConformance,
} from "./conformance/extensions/test-helpers.js";
import {
  agentsRecognizedConformance,
  initializedConformance,
  lockfileValidConformance,
  mcpNoSecretLiteralConformance,
  mcpTransportExclusivityConformance,
  packsDeclarationsValidConformance,
  settingsSchemaValidConformance,
  skillsDeclarationsValidConformance,
} from "./conformance/foundation/test-helpers.js";
import {
  instructionsAgentSupportedConformance,
  instructionsGitignoreCurrentConformance,
  instructionsSourcePresentConformance,
  instructionsTargetCurrentConformance,
  instructionsTargetStaleConformance,
  instructionsTargetUnownedConformance,
} from "./conformance/instructions/test-helpers.js";
import {
  mcpAgentDriftConformance,
  mcpAgentOrphanedConformance,
} from "./conformance/mcps/test-helpers.js";
import {
  desiredStateReconcilableConformance,
  sourceEndpointsAlignedConformance,
} from "./conformance/reconciliation/test-helpers.js";
import {
  agentsDetectedDeclaredConformance,
  agentsProjectionsStaleConformance,
  axmSkillDeclaredConformance,
  axmSkillCompatibleConformance,
  hookOwnershipAmbiguousConformance,
  knowledgeStateValidConformance,
  managedFileUnownedConformance,
  projectionContributorsRenderedConformance,
  projectionOwnershipValidConformance,
  settingsKeysRecognizedConformance,
} from "./conformance/workspace-state/test-helpers.js";
import {
  completeWorkspaceFindings,
  type WorkspaceRuleConformanceCase,
} from "./conformance/test-helpers.js";
import { workspaceRules } from "../workspace.js";

const cases: ReadonlyArray<WorkspaceRuleConformanceCase> = [
  initializedConformance,
  settingsSchemaValidConformance,
  settingsKeysRecognizedConformance,
  lockfileValidConformance,
  sourceEndpointsAlignedConformance,
  desiredStateReconcilableConformance,
  axmSkillDeclaredConformance,
  axmSkillCompatibleConformance,
  agentsRecognizedConformance,
  agentsDetectedDeclaredConformance,
  agentsProjectionsStaleConformance,
  instructionsSourcePresentConformance,
  instructionsTargetCurrentConformance,
  instructionsTargetUnownedConformance,
  instructionsTargetStaleConformance,
  instructionsAgentSupportedConformance,
  instructionsGitignoreCurrentConformance,
  projectionOwnershipValidConformance,
  projectionContributorsRenderedConformance,
  hookOwnershipAmbiguousConformance,
  managedFileUnownedConformance,
  skillsDeclarationsValidConformance,
  packsDeclarationsValidConformance,
  configuredButNotInstalledConformance,
  knowledgeStateValidConformance,
  mcpTransportExclusivityConformance,
  mcpNoSecretLiteralConformance,
  mcpAgentDriftConformance,
  mcpAgentOrphanedConformance,
  skillsLockfileAlignedConformance,
  skillsIntegrityValidConformance,
  skillsArtifactsCorrectConformance,
  packsDependenciesResolvedConformance,
];

describe("workspace rule conformance catalog", () => {
  it("covers each executable rule exactly once in catalog order", () => {
    const caseRuleIds = cases.map(({ rule }) => rule.id);
    expect(caseRuleIds).toEqual(workspaceRules.map(({ id }) => id));
    expect(new Set(caseRuleIds).size).toBe(caseRuleIds.length);
    expect(cases.map(({ rule }) => rule)).toEqual(workspaceRules);
  });
});

for (const testCase of cases) {
  describe(testCase.rule.id, () => {
    it.effect("has satisfied evidence", () =>
      Effect.gen(function* () {
        const context = yield* testCase.satisfied();
        expect(yield* testCase.rule.check(context)).toEqual([]);
      }),
    );

    it.effect("reports its exact violated evidence", () =>
      Effect.gen(function* () {
        const context = yield* testCase.violated();
        expect(yield* testCase.rule.check(context)).toEqual(completeWorkspaceFindings(testCase));
      }),
    );

    const inapplicable = testCase.inapplicable;
    if (inapplicable !== undefined) {
      it.effect("does not report when inapplicable", () =>
        Effect.gen(function* () {
          const context = yield* inapplicable();
          expect(yield* testCase.rule.check(context)).toEqual([]);
        }),
      );
    }
  });
}
