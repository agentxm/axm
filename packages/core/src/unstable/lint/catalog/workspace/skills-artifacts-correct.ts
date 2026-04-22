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
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { disableSkillOp, enableSkillOp } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";
import {
  isUniversalSkillsRelativeDir,
  resolveUniversalDirPresence,
} from "../../../extensions/universal-skills-dir.js";

const RULE_ID = "workspace/skills-artifacts-correct";
const SETTINGS_REL = ".axm/settings.json";

const SUG_ENABLE_PREFIX = "Re-enable skill ";
const SUG_DISABLE_PREFIX = "Disable skill ";

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
  message: `Skill '${name}' is enabled but missing per-agent artifacts (${reason}).`,
  suggestions: [`${SUG_ENABLE_PREFIX}'${name}' to recreate agent artifacts.`],
  location: { file: SETTINGS_REL },
});

const disableFinding = (name: string, reason: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' is disabled but still has per-agent artifacts (${reason}).`,
  suggestions: [`${SUG_DISABLE_PREFIX}'${name}' to clean up stale artifacts.`],
  location: { file: SETTINGS_REL },
});

const inconsistentFinding = (name: string, details: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${name}' has inconsistent artifacts across declared agents (${details}).`,
  suggestions: [`${SUG_ENABLE_PREFIX}'${name}' to normalize across declared agents.`],
  location: { file: SETTINGS_REL },
});

const NAME_FROM_SUGGESTION_RE = /'([^']+)'/;
const extractSkillName = (suggestion: string): string | undefined =>
  NAME_FROM_SUGGESTION_RE.exec(suggestion)?.[1];

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

      const declaredSkills = settings.value.skills ?? {};
      const findings: Array<LintFinding> = [];

      const universalAgentIds = new Set(
        declaredAgents.filter((a) => isUniversalSkillsRelativeDir(a.skills.dir)).map((a) => a.id),
      );

      for (const [name, entry] of Object.entries(declaredSkills)) {
        const perAgentExists = yield* Effect.all(
          declaredAgents.map((agent) =>
            context.workspace
              .exists(artifactPath(agent, name))
              .pipe(Effect.map((exists) => ({ agentId: agent.id, exists }))),
          ),
          { concurrency: "unbounded" },
        );
        const collapsed = resolveUniversalDirPresence(perAgentExists, universalAgentIds);
        const missingAgents = collapsed.filter((p) => !p.exists).map((p) => p.agentId);
        const presentAgents = collapsed.filter((p) => p.exists).map((p) => p.agentId);

        if (entry.enabled) {
          if (missingAgents.length === 0) {
            continue;
          }
          if (presentAgents.length === 0) {
            findings.push(enableFinding(name, `missing in: ${missingAgents.join(", ")}`));
          } else {
            findings.push(
              inconsistentFinding(
                name,
                `present in ${presentAgents.join(", ")}, missing in ${missingAgents.join(", ")}`,
              ),
            );
          }
          continue;
        }

        // Disabled skill: flag if any artifact is still present.
        if (presentAgents.length > 0) {
          findings.push(disableFinding(name, `present in: ${presentAgents.join(", ")}`));
        }
      }
      return findings;
    }),
  fix: (_context, finding) =>
    Effect.sync(() => {
      const name = extractSkillName(finding.suggestions[0]);
      if (name === undefined) {
        return EMPTY_OPERATIONS;
      }
      if (finding.suggestions[0].startsWith(SUG_ENABLE_PREFIX)) {
        return [enableSkillOp({ name })];
      }
      if (finding.suggestions[0].startsWith(SUG_DISABLE_PREFIX)) {
        return [disableSkillOp({ name })];
      }
      return EMPTY_OPERATIONS;
    }),
};
