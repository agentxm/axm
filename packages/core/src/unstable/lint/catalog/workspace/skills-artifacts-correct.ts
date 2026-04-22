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
 * do not.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixableFinding, AutofixingRule, LintFinding } from "../../rule.js";
import type { AgentDescriptor } from "../../../agents/types.js";
import type { Operation } from "../../../plan/plan.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { disableSkillOp, enableSkillOp } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import {
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
} from "../../../extensions/universal-skills-dir.js";

const RULE_ID = "workspace/skills-artifacts-correct";
const SETTINGS_REL = ".axm/settings.json";

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

const artifactPath = (agent: AgentDescriptor, skillName: string): string =>
  `${agent.skills.dir}/${skillName}`;

const enableFinding = (name: string, reason: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed as enabled, but it is missing from some declared agents. Detail: ${reason}. ` +
    "Run `axm lint --fix` to make it present for every declared agent.",
  location: { file: SETTINGS_REL },
});

const disableFinding = (name: string, reason: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is listed as disabled, but it is still present in some declared agents. Detail: ${reason}. ` +
    "Run `axm lint --fix` to remove it from those agents.",
  location: { file: SETTINGS_REL },
});

const inconsistentFinding = (name: string, details: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    `Skill '${name}' is present for some declared agents but missing from others. Detail: ${details}. ` +
    "Run `axm lint --fix` to make its presence consistent across the declared agents.",
  location: { file: SETTINGS_REL },
});

interface ArtifactViolation {
  readonly finding: AutofixableFinding;
  readonly operation: Operation<string, unknown>;
}

const isSameFinding = (left: AutofixableFinding, right: AutofixableFinding): boolean =>
  left.ruleId === right.ruleId &&
  left.message === right.message &&
  left.location?.file === right.location?.file;

const collectArtifactViolations = (
  existenceBySkill: ReadonlyArray<{
    readonly name: string;
    readonly enabled: boolean;
    readonly presentAgents: ReadonlyArray<string>;
    readonly missingAgents: ReadonlyArray<string>;
  }>,
): ReadonlyArray<ArtifactViolation> => {
  const violations: Array<ArtifactViolation> = [];

  for (const { name, enabled, presentAgents, missingAgents } of existenceBySkill) {
    if (enabled) {
      if (missingAgents.length === 0) {
        continue;
      }
      if (presentAgents.length === 0) {
        violations.push({
          finding: enableFinding(name, `missing from agents: ${missingAgents.join(", ")}`),
          operation: enableSkillOp({ name }),
        });
        continue;
      }
      violations.push({
        finding: inconsistentFinding(
          name,
          `present for agents: ${presentAgents.join(", ")}; missing from agents: ${missingAgents.join(", ")}`,
        ),
        operation: enableSkillOp({ name }),
      });
      continue;
    }

    if (presentAgents.length > 0) {
      violations.push({
        finding: disableFinding(name, `present for agents: ${presentAgents.join(", ")}`),
        operation: disableSkillOp({ name }),
      });
    }
  }

  return violations;
};

export const skillsArtifactsCorrectRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Enabled skills have artifacts in every declared agent; disabled skills have none.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_LINT_FINDINGS;
      }

      const declaredAgentIds = new Set(settings.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_LINT_FINDINGS;
      }
      const knownAgents = yield* context.workspace.knownAgents;
      const declaredAgents = knownAgents.filter((a) => declaredAgentIds.has(a.id));

      const universalAgentIds = new Set(
        declaredAgents.filter((a) => isUniversalSkillsRelativeDir(a.skills.dir)).map((a) => a.id),
      );
      const existenceBySkill = yield* Effect.all(
        Object.entries(settings.value.skills ?? {}).map(([name, entry]) =>
          Effect.all(
            declaredAgents.map((agent) =>
              context.workspace
                .exists(artifactPath(agent, name))
                .pipe(Effect.map((exists) => ({ agentId: agent.id, exists }))),
            ),
            { concurrency: "unbounded" },
          ).pipe(
            Effect.map((perAgentExists) => {
              const collapsed = resolveUniversalDirPresence(perAgentExists, universalAgentIds);
              return {
                name,
                enabled: entry.enabled,
                presentAgents: collapsed.filter((p) => p.exists).map((p) => p.agentId),
                missingAgents: collapsed.filter((p) => !p.exists).map((p) => p.agentId),
              };
            }),
          ),
        ),
        { concurrency: "unbounded" },
      );
      const violations = collectArtifactViolations(existenceBySkill);
      return violations.map((violation): LintFinding => violation.finding);
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_OPERATIONS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_OPERATIONS;
      }

      const declaredAgentIds = new Set(settings.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_OPERATIONS;
      }
      const knownAgents = yield* context.workspace.knownAgents;
      const declaredAgents = knownAgents.filter((a) => declaredAgentIds.has(a.id));
      const universalAgentIds = new Set(
        declaredAgents.filter((a) => isUniversalSkillsRelativeDir(a.skills.dir)).map((a) => a.id),
      );
      const existenceBySkill = yield* Effect.all(
        Object.entries(settings.value.skills ?? {}).map(([name, entry]) =>
          Effect.all(
            declaredAgents.map((agent) =>
              context.workspace
                .exists(artifactPath(agent, name))
                .pipe(Effect.map((exists) => ({ agentId: agent.id, exists }))),
            ),
            { concurrency: "unbounded" },
          ).pipe(
            Effect.map((perAgentExists) => {
              const collapsed = resolveUniversalDirPresence(perAgentExists, universalAgentIds);
              return {
                name,
                enabled: entry.enabled,
                presentAgents: collapsed.filter((p) => p.exists).map((p) => p.agentId),
                missingAgents: collapsed.filter((p) => !p.exists).map((p) => p.agentId),
              };
            }),
          ),
        ),
        { concurrency: "unbounded" },
      );
      const violation = collectArtifactViolations(existenceBySkill).find((candidate) =>
        isSameFinding(candidate.finding, finding),
      );
      return violation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
