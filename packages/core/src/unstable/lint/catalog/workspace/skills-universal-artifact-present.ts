/**
 * `workspace/skills-universal-artifact-present` — each enabled managed skill
 * has the workspace-level `.agents/skills/<name>` artifact.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import type { Operation } from "../../../plan/plan.js";
import { isUniversalSkillsRelativeDir } from "../../../extensions/universal-skills-dir.js";
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
    `Skill '${name}' is enabled, but it is missing from the universal .agents/skills directory. ` +
    "Run `axm lint --fix` to materialize the universal skill artifact.",
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
    readonly resolved: Option.Option<unknown>;
    readonly actual: ReadonlyArray<{
      readonly hasSkillMd: boolean;
      readonly origin: { readonly _tag: string; readonly agentId?: string };
    }>;
  }>,
  universalAgentIds: ReadonlySet<string>,
): ReadonlyArray<UniversalArtifactViolation> => {
  const violations: Array<UniversalArtifactViolation> = [];
  for (const row of rows) {
    if (row.activation !== "enabled" || Option.isNone(row.resolved)) {
      continue;
    }
    const present = row.actual.some(
      (actual) =>
        actual.hasSkillMd &&
        actual.origin._tag === "agent-skill-dir" &&
        actual.origin.agentId !== undefined &&
        universalAgentIds.has(actual.origin.agentId),
    );
    if (present) {
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
  description: "Enabled managed skills have a workspace-level universal artifact.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const knownAgents = yield* context.workspace.agents.known;
      const universalAgentIds = new Set(
        knownAgents
          .filter((agent) => isUniversalSkillsRelativeDir(agent.skills.dir))
          .map((agent) => agent.id),
      );
      const installed = yield* context.workspace.skills.installed;
      const violations = collectUniversalArtifactViolations(installed, universalAgentIds);
      return violations.map((violation): LintFinding => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const knownAgents = yield* context.workspace.agents.known;
      const universalAgentIds = new Set(
        knownAgents
          .filter((agent) => isUniversalSkillsRelativeDir(agent.skills.dir))
          .map((agent) => agent.id),
      );
      const installed = yield* context.workspace.skills.installed;
      const violation = collectUniversalArtifactViolations(installed, universalAgentIds).find(
        (candidate) => isSameFinding(candidate.finding, finding),
      );
      return violation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
