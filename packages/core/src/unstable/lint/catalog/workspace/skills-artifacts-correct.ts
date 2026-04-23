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
import type { AgentDescriptor } from "../../../agents/types.js";
import type { Operation } from "../../../plan/plan.js";
import { type Lockfile } from "../../../lockfile/schema.js";
import { type Settings } from "../../../settings/schema.js";
import { decodeLockfile, decodeSettings } from "./helpers/decode.js";
import { isSameFinding } from "./helpers/finding.js";
import { disableSkillOp, enableSkillOp } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import {
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
} from "../../../extensions/universal-skills-dir.js";
import { buildRetainedSkillFqns, isImplicitRetainedSkill } from "./helpers/retained-skills.js";

const RULE_ID = "workspace/skills-artifacts-correct";
const SETTINGS_REL = ".axm/settings.json";

const artifactPath = (agent: AgentDescriptor, skillName: string): string =>
  `${agent.skills.dir}/${skillName}`;

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

const collectImplicitSkillNames = (
  settings: Settings,
  lockfile: Lockfile,
): ReadonlyArray<string> => {
  const declaredSkills = settings.skills ?? {};
  const retainedFqns = buildRetainedSkillFqns(settings, lockfile);
  return Object.entries(lockfile.skills)
    .filter(([name, entry]) => isImplicitRetainedSkill(name, entry, declaredSkills, retainedFqns))
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
};

const collectImplicitSkillNamesFromLockfile = (
  settings: Settings,
  lockfileResult: Result.Result<Option.Option<unknown>, unknown>,
): ReadonlyArray<string> => {
  if (Result.isFailure(lockfileResult)) {
    return [];
  }
  const lockOption = lockfileResult.success;
  if (Option.isNone(lockOption)) {
    return [];
  }
  const lockfile = decodeLockfile(lockOption.value);
  if (Option.isNone(lockfile)) {
    return [];
  }
  return collectImplicitSkillNames(settings, lockfile.value);
};

export const skillsArtifactsCorrectRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Skill directories match each skill's enabled state across declared agents.",
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
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      const implicitSkillNames = collectImplicitSkillNamesFromLockfile(
        settings.value,
        lockfileResult,
      );

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
        [
          ...Object.entries(settings.value.skills ?? {}).map(([name, entry]) => ({
            name,
            enabled: entry.enabled,
            implicit: false,
          })),
          ...implicitSkillNames.map((name) => ({ name, enabled: true, implicit: true })),
        ].map(({ name, enabled, implicit }) =>
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
                enabled,
                presentAgents: collapsed.filter((p) => p.exists).map((p) => p.agentId),
                missingAgents: collapsed.filter((p) => !p.exists).map((p) => p.agentId),
                implicit,
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
      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      const implicitSkillNames = collectImplicitSkillNamesFromLockfile(
        settings.value,
        lockfileResult,
      );

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
        [
          ...Object.entries(settings.value.skills ?? {}).map(([name, entry]) => ({
            name,
            enabled: entry.enabled,
            implicit: false,
          })),
          ...implicitSkillNames.map((name) => ({ name, enabled: true, implicit: true })),
        ].map(({ name, enabled, implicit }) =>
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
                enabled,
                presentAgents: collapsed.filter((p) => p.exists).map((p) => p.agentId),
                missingAgents: collapsed.filter((p) => !p.exists).map((p) => p.agentId),
                implicit,
              };
            }),
          ),
        ),
        { concurrency: "unbounded" },
      );
      const violation = collectArtifactViolations(existenceBySkill).find(
        (candidate) =>
          candidate.finding.kind === "autofixable" &&
          candidate.operation !== undefined &&
          isSameFinding(candidate.finding, finding),
      );
      return violation?.operation === undefined ? EMPTY_OPERATIONS : [violation.operation];
    }),
};
