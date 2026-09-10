/**
 * `workspace/skills-declarations-valid` — declared skills name a resolvable,
 * owner-qualified, unique source.
 *
 * Cascade per the lint design (reports the
 * first failing arm per affected entity):
 *
 * 1. Source resolvability — the source string is shaped like a ref we can
 *    route (owner-qualified FQN like `@owner/skills/name`, a known source
 *    host, `file://` URL, local path). Bare names (`just-a-name`) fail.
 * 2. Owner qualification — registry-shaped sources carry an `@owner`
 *    prefix; entries whose source looks registry-ish but omits the owner
 *    fail.
 * 3. Duplicate FQNs — when two settings entries normalize to the same
 *    owner/type/name FQN, both entries emit a finding.
 *
 * One finding per affected entity (per-entity cascade). Advisory — no lint
 * autofix; resolve invalid or duplicate declarations with install/uninstall
 * commands.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { settingsDisplayPath } from "./display-paths.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";
import { categorizeEntry, type Categorized } from "./helpers/source-categorize.js";

const RULE_ID = "workspace/skills-declarations-valid";
const findingForBareName = (entry: Categorized, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${entry.name}' uses ambiguous bare source '${entry.source}'.`,
  location: { file: settingsPath },
});

const findingForMissingOwner = (entry: Categorized, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${entry.name}' source '${entry.source}' is missing its owner-qualified identity.`,
  location: { file: settingsPath },
});

const findingForDuplicate = (
  entry: Categorized,
  duplicates: ReadonlyArray<string>,
  settingsPath: string,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Skill '${entry.name}' duplicates the same Skill identity as: ${duplicates.join(", ")}.`,
  location: { file: settingsPath },
});

export const skillsDeclarationsValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Declared skills use unique, resolvable sources.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const declaredResult = yield* Effect.result(scoped.skills.declared);
      if (Result.isFailure(declaredResult) || Option.isNone(declaredResult.success)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const entries: ReadonlyArray<Categorized> = declaredResult.success.value.map(
        ({ name, entry }) => categorizeEntry(name, entry.source),
      );

      // Group by registry FQN for duplicate detection.
      const byFqn = new Map<string, Array<Categorized>>();
      for (const entry of entries) {
        if (
          (entry.kind !== "registry" && entry.kind !== "workspace") ||
          entry.registryFqn === undefined
        ) {
          continue;
        }
        const group = byFqn.get(entry.registryFqn) ?? [];
        group.push(entry);
        byFqn.set(entry.registryFqn, group);
      }

      const findings: Array<AdvisoryFinding> = [];
      const settingsPath = settingsDisplayPath(context.subject.scope);
      for (const entry of entries) {
        if (entry.kind === "bare") {
          findings.push(findingForBareName(entry, settingsPath));
          continue;
        }
        if (entry.kind === "registry-no-owner") {
          findings.push(findingForMissingOwner(entry, settingsPath));
          continue;
        }
        if (entry.kind === "non-registry") {
          // Non-registry sources are allowed for skills (local, git-hosted)
          // and don't fire this rule. Move on.
          continue;
        }
        if (
          (entry.kind === "registry" || entry.kind === "workspace") &&
          entry.registryFqn !== undefined
        ) {
          const group = byFqn.get(entry.registryFqn) ?? [];
          if (group.length > 1) {
            findings.push(
              findingForDuplicate(entry, group.map((g) => g.name).sort(), settingsPath),
            );
          }
        }
      }
      return findings;
    }),
};
