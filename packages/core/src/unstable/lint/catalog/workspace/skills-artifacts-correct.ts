/**
 * `workspace/skills-artifacts-correct` — each enabled skill has artifacts in
 * every declared agent's skill target; disabled skills have none.
 *
 * Three symptoms of the same invariant (§10.workspace.Skills note):
 *
 * - **Enabled-but-not-linked** — a skill declared `enabled: true` is missing
 *   its per-agent artifact for at least one declared agent. Autofix:
 *   `enable-skill` (the handler recreates symlinks across configured agents).
 * - **Disabled-but-still-present** — a skill declared `enabled: false` still
 *   has a per-agent artifact for at least one declared agent. Autofix:
 *   `disable-skill`.
 * - **Cross-agent-inconsistent** — an enabled skill has artifacts in some
 *   declared agents but not others. Autofix: `enable-skill`.
 *
 * One finding per affected skill (per-entity cascade); the first arm that
 * fires for a skill emits its finding and the other arms for the same skill
 * do not. Configured skills keep the existing autofix arms; pack-provided
 * implicit skills emit advisory findings because the repair is a pack-level
 * reinstall.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type {
  AdvisoryFinding,
  AutofixableFinding,
  AutofixingRule,
  LintFinding,
} from "../../rule.js";
import type { Operation } from "../../../plan/plan.js";
import { isSameFinding } from "./helpers/finding.js";
import { disableSkillOp, enableSkillOp } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import {
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
} from "../../../extensions/universal-skills-dir.js";

const RULE_ID = "workspace/skills-artifacts-correct";
const SETTINGS_REL = ".axm/settings.json";

const enableFinding = (name: string, reason: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed as enabled, but it is missing from some declared agents. Missing from agents: ${reason}. ` +
    "Run `axm lint --fix` to make it present for every declared agent.",
  location: { file: SETTINGS_REL },
});

const disableFinding = (name: string, reason: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed as disabled, but it is still present in some declared agents. Present for agents: ${reason}. ` +
    "Run `axm lint --fix` to remove it from those agents.",
  location: { file: SETTINGS_REL },
});

const inconsistentFinding = (name: string, details: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is present for some declared agents but missing from others. ${details}. ` +
    "Run `axm lint --fix` to make its presence consistent across the declared agents.",
  location: { file: SETTINGS_REL },
});

interface ArtifactViolation {
  readonly finding: LintFinding;
  readonly operation?: Operation<string, unknown>;
}

const implicitEnableFinding = (name: string, reason: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Pack-provided skill '${name}' is missing from some declared agents. Missing from agents: ${reason}. ` +
    "Run `axm install` to reinstall the owning pack declarations and recreate the missing artifacts.",
  location: { file: SETTINGS_REL },
});

const collectArtifactViolations = (
  existenceBySkill: ReadonlyArray<{
    readonly name: string;
    readonly enabled: boolean;
    readonly presentAgents: ReadonlyArray<string>;
    readonly missingAgents: ReadonlyArray<string>;
    readonly implicit: boolean;
  }>,
): ReadonlyArray<ArtifactViolation> => {
  const violations: Array<ArtifactViolation> = [];

  for (const { name, enabled, presentAgents, missingAgents, implicit } of existenceBySkill) {
    if (enabled) {
      if (missingAgents.length === 0) {
        continue;
      }
      if (implicit) {
        violations.push({
          finding: implicitEnableFinding(name, missingAgents.join(", ")),
        });
        continue;
      }
      if (presentAgents.length === 0) {
        violations.push({
          finding: enableFinding(name, missingAgents.join(", ")),
          operation: enableSkillOp({ name }),
        });
        continue;
      }
      violations.push({
        finding: inconsistentFinding(
          name,
          `Present for agents: ${presentAgents.join(", ")}. Missing from agents: ${missingAgents.join(", ")}`,
        ),
        operation: enableSkillOp({ name }),
      });
      continue;
    }

    if (presentAgents.length > 0) {
      violations.push({
        finding: disableFinding(name, presentAgents.join(", ")),
        operation: disableSkillOp({ name }),
      });
    }
  }

  return violations;
};

export const skillsArtifactsCorrectRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Skill directories match each skill's enabled state across declared agents.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace.scope(context.subject.scope);
      const settingsResult = yield* Effect.result(scoped.state.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      if (Option.isNone(settingsResult.success)) {
        return EMPTY_LINT_FINDINGS;
      }
      const declaredAgentIds = new Set(settingsResult.success.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_LINT_FINDINGS;
      }
      const knownAgents = yield* scoped.agents.known;
      const declaredAgents = knownAgents.filter((agent) => declaredAgentIds.has(agent.id));

      const universalAgentIds = new Set(
        declaredAgents
          .filter((agent) => isUniversalSkillsRelativeDir(agent.skills.dir))
          .map((agent) => agent.id),
      );
      const installed = yield* scoped.skills.installed;
      const existenceBySkill = installed.flatMap((row) => {
        const implicit = row.installationOrigin._tag === "pack-member";
        if (implicit && Option.isNone(row.resolved)) {
          return [];
        }
        const present = new Set(
          row.actual.flatMap((actual) =>
            actual.origin._tag === "agent-skill-dir" ? [actual.origin.agentId] : [],
          ),
        );
        const collapsed = resolveUniversalDirPresence(
          declaredAgents.map((agent) => ({ agentId: agent.id, exists: present.has(agent.id) })),
          universalAgentIds,
        );
        return {
          name: row.key.name,
          enabled: row.activation === "enabled",
          presentAgents: collapsed.filter((p) => p.exists).map((p) => p.agentId),
          missingAgents: collapsed.filter((p) => !p.exists).map((p) => p.agentId),
          implicit,
        };
      });
      const violations = collectArtifactViolations(existenceBySkill);
      return violations.map((violation): LintFinding => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const scoped = context.workspace.scope(context.subject.scope);
      const settingsResult = yield* Effect.result(scoped.state.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_OPERATIONS;
      }
      if (Option.isNone(settingsResult.success)) {
        return EMPTY_OPERATIONS;
      }
      const declaredAgentIds = new Set(settingsResult.success.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_OPERATIONS;
      }
      const knownAgents = yield* scoped.agents.known;
      const declaredAgents = knownAgents.filter((agent) => declaredAgentIds.has(agent.id));
      const universalAgentIds = new Set(
        declaredAgents
          .filter((agent) => isUniversalSkillsRelativeDir(agent.skills.dir))
          .map((agent) => agent.id),
      );
      const installed = yield* scoped.skills.installed;
      const existenceBySkill = installed.flatMap((row) => {
        const implicit = row.installationOrigin._tag === "pack-member";
        if (implicit && Option.isNone(row.resolved)) {
          return [];
        }
        const present = new Set(
          row.actual.flatMap((actual) =>
            actual.origin._tag === "agent-skill-dir" ? [actual.origin.agentId] : [],
          ),
        );
        const collapsed = resolveUniversalDirPresence(
          declaredAgents.map((agent) => ({ agentId: agent.id, exists: present.has(agent.id) })),
          universalAgentIds,
        );
        return {
          name: row.key.name,
          enabled: row.activation === "enabled",
          presentAgents: collapsed.filter((p) => p.exists).map((p) => p.agentId),
          missingAgents: collapsed.filter((p) => !p.exists).map((p) => p.agentId),
          implicit,
        };
      });
      const violation = collectArtifactViolations(existenceBySkill).find(
        (candidate) =>
          candidate.finding.kind === "autofixable" &&
          candidate.operation !== undefined &&
          isSameFinding(candidate.finding, finding),
      );
      return violation?.operation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
