/**
 * `workspace/skills-universal-artifact-present` — each enabled managed skill
 * targets the synthetic universal agent.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import type { Operation } from "../../../plan/plan.js";
import { isSameFinding } from "./helpers/finding.js";
import { enableSkillOp } from "./helpers/install-ops.js";
import { EMPTY_OPERATIONS } from "./helpers/empty.js";

const RULE_ID = "workspace/skills-universal-artifact-present";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

const missingFinding = (name: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is enabled, but its lockfile entry does not target the universal agent. ` +
    "Run `axm lint --fix` to reconcile universal skill materialization.",
  location: { file: LOCKFILE_REL },
});

interface UniversalArtifactViolation {
  readonly finding: AutofixableFinding;
  readonly operation: Operation<string, unknown>;
}

const collectUniversalArtifactViolations = (
  rows: ReadonlyArray<{
    readonly key: { readonly name: string };
    readonly activation: string;
    readonly resolved: Option.Option<{
      readonly lockEntry: { readonly agents: ReadonlyArray<string> };
    }>;
  }>,
): ReadonlyArray<UniversalArtifactViolation> => {
  const violations: Array<UniversalArtifactViolation> = [];
  for (const row of rows) {
    if (row.activation !== "enabled" || Option.isNone(row.resolved)) {
      continue;
    }
    if (row.resolved.value.lockEntry.agents.includes("universal")) {
      continue;
    }
    violations.push({
      finding: missingFinding(row.key.name),
      operation: enableSkillOp({ name: row.key.name }),
    });
  }
  return violations;
};

export const skillsUniversalArtifactPresentRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Enabled managed skills target the universal materialization agent.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const installed = yield* context.workspace.skills.installed;
      const violations = collectUniversalArtifactViolations(installed);
      return violations.map((violation): LintFinding => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const installed = yield* context.workspace.skills.installed;
      const violation = collectUniversalArtifactViolations(installed).find((candidate) =>
        isSameFinding(candidate.finding, finding),
      );
      return violation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
