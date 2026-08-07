/** Knowledge declarations, canonical content, and receipt state stay reachable. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { parseExtensionFqnParts } from "../../../extensions/common.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/knowledge-state-valid";

const finding = (message: string, file: string): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message,
  location: { file },
});

export const knowledgeStateValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Knowledge content, declarations, trust, and receipt state stay mutually reachable.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const graphResult = yield* Effect.result(context.health.desiredState);
      const settingsResult = yield* Effect.result(context.workspace.state.settings);
      const lockResult = yield* Effect.result(context.workspace.state.lockfile);
      if (
        Result.isFailure(graphResult) ||
        Result.isFailure(settingsResult) ||
        Result.isFailure(lockResult)
      ) {
        return [];
      }

      const desiredNames = new Set(
        graphResult.success.nodes
          .filter((node) => node.type === "knowledge")
          .map((node) => node.name),
      );
      const locked = Option.match(lockResult.success, {
        onNone: () => ({}),
        onSome: (lockfile) => lockfile.knowledge ?? {},
      });
      const declaredPackNames = new Set(
        Option.match(settingsResult.success, {
          onNone: () => [],
          onSome: (settings) => Object.keys(settings.packs ?? {}),
        }),
      );
      const packEntries = Option.match(lockResult.success, {
        onNone: () => [],
        onSome: (lockfile) => Object.entries(lockfile.packs ?? {}),
      });
      for (const [packName, packEntry] of packEntries) {
        if (!declaredPackNames.has(packName)) continue;
        for (const fqn of Object.keys(packEntry.resolvedKnowledge ?? {})) {
          const parsed = parseExtensionFqnParts(fqn);
          if (parsed?.type === "knowledge") desiredNames.add(parsed.name);
        }
      }
      const findings: Array<AdvisoryFinding> = [];
      for (const name of desiredNames) {
        if (!Object.hasOwn(locked, name)) {
          findings.push(
            finding(
              `Knowledge bundle '${name}' is declared or required by a pack but has no receipt entry. Reinstall it before synchronization.`,
              ".axm/axm-lock.yaml",
            ),
          );
        }
      }
      for (const name of Object.keys(locked)) {
        if (!desiredNames.has(name)) {
          findings.push(
            finding(
              `Knowledge receipt '${name}' is orphaned from every direct or pack declaration. Run \`axm prune\` to remove stale Knowledge state.`,
              ".axm/axm-lock.yaml",
            ),
          );
        }
      }

      const unmanagedResult = yield* Effect.result(context.workspace.knowledge.unmanaged);
      if (Result.isSuccess(unmanagedResult)) {
        for (const row of unmanagedResult.success) {
          if (desiredNames.has(row.key.name)) continue;
          findings.push(
            finding(
              `Canonical Knowledge content '${row.key.name}' is not reachable from a direct or pack declaration. Run \`axm prune\` to remove it.`,
              row.actual.packageRoot ?? row.actual.contentRoot,
            ),
          );
        }
      }

      if (context.health.canonicalObservations !== undefined) {
        const observations = yield* Effect.result(context.health.canonicalObservations);
        if (Result.isSuccess(observations)) {
          for (const { desired, observation } of observations.success) {
            if (
              desired.type !== "knowledge" ||
              observation.status === "usable" ||
              observation.status === "not-applicable"
            ) {
              continue;
            }
            findings.push(
              finding(
                `Knowledge bundle '${desired.name}' has invalid canonical or trust state: ${observation.status}.`,
                observation.path ?? ".axm/trust.json",
              ),
            );
          }
        }
      }
      return findings;
    }),
};
