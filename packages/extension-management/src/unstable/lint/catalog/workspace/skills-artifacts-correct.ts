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
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type {
  AdvisoryFinding,
  AdvisoryRule,
  LintFinding,
} from "@agentxm/registry-protocol/unstable/lint/rule";
import { EMPTY_LINT_FINDINGS } from "./helpers/empty.js";
import {
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
} from "../../../extensions/universal-skills-dir.js";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agents/types";
import { settingsDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/skills-artifacts-correct";
const enableFinding = (name: string, reason: string, path: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' is enabled, but it is missing from declared agents: ${reason}.`,
  location: { file: path },
});

const disableFinding = (name: string, reason: string, path: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' is disabled, but it is still present for declared agents: ${reason}.`,
  location: { file: path },
});

const inconsistentFinding = (name: string, details: string, path: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' is present for some declared agents but missing from others. ${details}.`,
  location: { file: path },
});

interface ArtifactViolation {
  readonly finding: LintFinding;
}

const implicitEnableFinding = (name: string, reason: string, path: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack-provided skill '${name}' is missing from declared agents: ${reason}.`,
  location: { file: path },
});

const collectArtifactViolations = (
  existenceBySkill: ReadonlyArray<{
    readonly name: string;
    readonly enabled: boolean;
    readonly presentAgents: ReadonlyArray<string>;
    readonly missingAgents: ReadonlyArray<string>;
    readonly implicit: boolean;
  }>,
  settingsPath: string,
): ReadonlyArray<ArtifactViolation> => {
  const violations: Array<ArtifactViolation> = [];

  for (const { name, enabled, presentAgents, missingAgents, implicit } of existenceBySkill) {
    if (enabled) {
      if (missingAgents.length === 0) {
        continue;
      }
      if (implicit) {
        violations.push({
          finding: implicitEnableFinding(name, missingAgents.join(", "), settingsPath),
        });
        continue;
      }
      if (presentAgents.length === 0) {
        violations.push({
          finding: enableFinding(name, missingAgents.join(", "), settingsPath),
        });
        continue;
      }
      violations.push({
        finding: inconsistentFinding(
          name,
          `Present for agents: ${presentAgents.join(", ")}. Missing from agents: ${missingAgents.join(", ")}`,
          settingsPath,
        ),
      });
      continue;
    }

    if (presentAgents.length > 0) {
      violations.push({
        finding: disableFinding(name, presentAgents.join(", "), settingsPath),
      });
    }
  }

  return violations;
};

export const skillsArtifactsCorrectRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Skill directories match each skill's enabled state across declared agents.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const settingsResult = yield* Effect.result(scoped.state.settings);
      // The schema/readability rules own these failures and emit the precise
      // finding. This dependent rule cannot evaluate artifact correctness.
      if (Result.isFailure(settingsResult)) return EMPTY_LINT_FINDINGS;
      const settings = settingsResult.success;
      if (Option.isNone(settings)) {
        return EMPTY_LINT_FINDINGS;
      }
      const declaredAgentIds = new Set(settings.value.agents ?? []);
      if (declaredAgentIds.size === 0) {
        return EMPTY_LINT_FINDINGS;
      }
      const knownAgents = yield* scoped.agents.known;
      const declaredAgents = knownAgents.filter(
        (agent) => isConfigurableAgentId(agent.id) && declaredAgentIds.has(agent.id),
      );

      const universalAgentIds = new Set(
        declaredAgents
          .filter(
            (agent) => agent.skills !== undefined && isUniversalSkillsRelativeDir(agent.skills.dir),
          )
          .map((agent) => agent.id),
      );
      const installedResult = yield* Effect.result(scoped.skills.installed);
      // The lockfile/readability rules own this failure; avoid turning it into
      // a defect or duplicating a less precise finding here.
      if (Result.isFailure(installedResult)) return EMPTY_LINT_FINDINGS;
      const installed = installedResult.success;
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
      const violations = collectArtifactViolations(
        existenceBySkill,
        settingsDisplayPath(context.subject.scope),
      );
      return violations.map((violation): LintFinding => violation.finding);
    }),
};
