/**
 * `workspace/packs-declarations-valid` — declared packs name a resolvable,
 * owner-qualified, unique source.
 *
 * Mirrors `workspace/skills-declarations-valid` against the packs map:
 *
 * 1. Source resolvability — pack source is not a bare name.
 * 2. Owner qualification — registry-shaped pack sources carry `@owner/`.
 * 3. Duplicate FQNs — two settings entries normalize to the same FQN.
 *
 * One finding per affected entity. Advisory.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { settingsDisplayPath } from "./display-paths.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";
import { categorizeEntry, type Categorized } from "./helpers/source-categorize.js";

const RULE_ID = "workspace/packs-declarations-valid";
const bareNameFinding = (entry: Categorized, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' uses ambiguous bare source '${entry.source}'.`,
  location: { file: settingsPath },
});

const nonRegistryFinding = (entry: Categorized, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' source '${entry.source}' is not a supported Pack source reference.`,
  location: { file: settingsPath },
});

const missingOwnerFinding = (entry: Categorized, settingsPath: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' source '${entry.source}' is missing its owner-qualified identity.`,
  location: { file: settingsPath },
});

const duplicateFinding = (
  entry: Categorized,
  duplicates: ReadonlyArray<string>,
  settingsPath: string,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message: `Pack '${entry.name}' duplicates the same Pack identity as: ${duplicates.join(", ")}.`,
  location: { file: settingsPath },
});

export const packsDeclarationsValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Declared packs use unique, resolvable registry sources.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const declaredResult = yield* Effect.result(scoped.packs.declared);
      if (Result.isFailure(declaredResult) || Option.isNone(declaredResult.success)) {
        return EMPTY_ADVISORY_FINDINGS;
      }
      const entries: ReadonlyArray<Categorized> = declaredResult.success.value.map(
        ({ name, entry }) => categorizeEntry(name, entry.source),
      );

      const byFqn = new Map<string, Array<Categorized>>();
      for (const entry of entries) {
        if (
          (entry.kind === "registry" || entry.kind === "workspace") &&
          entry.registryFqn !== undefined
        ) {
          const group = byFqn.get(entry.registryFqn) ?? [];
          group.push(entry);
          byFqn.set(entry.registryFqn, group);
        }
      }

      const findings: Array<AdvisoryFinding> = [];
      const settingsPath = settingsDisplayPath(context.subject.scope);
      for (const entry of entries) {
        switch (entry.kind) {
          case "bare":
            findings.push(bareNameFinding(entry, settingsPath));
            break;
          case "non-registry":
            findings.push(nonRegistryFinding(entry, settingsPath));
            break;
          case "registry-no-owner":
            findings.push(missingOwnerFinding(entry, settingsPath));
            break;
          case "registry": {
            if (entry.registryFqn === undefined) {
              break;
            }
            const group = byFqn.get(entry.registryFqn) ?? [];
            if (group.length > 1) {
              findings.push(duplicateFinding(entry, group.map((g) => g.name).sort(), settingsPath));
            }
            break;
          }
          case "workspace": {
            if (entry.registryFqn === undefined) {
              break;
            }
            const group = byFqn.get(entry.registryFqn) ?? [];
            if (group.length > 1) {
              findings.push(duplicateFinding(entry, group.map((g) => g.name).sort(), settingsPath));
            }
            break;
          }
        }
      }
      return findings;
    }),
};
