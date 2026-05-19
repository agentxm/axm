import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ContextFilesRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import {
  advisory,
  decodeContextFilesManifest,
  CONTEXT_FILES_JSON,
  isUnsafeWorkspaceTarget,
} from "./helpers.js";

const RULE_ID = "context-files/target-valid";

export const targetValidRule: AdvisoryRule<ContextFilesRuleContext> = {
  id: RULE_ID,
  description: "File contents targets stay within the workspace and avoid whole-file collisions.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.succeed(
      ((): ReadonlyArray<AdvisoryFinding> => {
        const manifest = decodeContextFilesManifest(context.subject.contextFilesJson);
        if (Option.isNone(manifest)) {
          return [];
        }

        const findings: Array<AdvisoryFinding> = [];
        const wholeFileTargets = new Map<string, number>();
        for (const [index, entry] of manifest.value.contents.entries()) {
          if (isUnsafeWorkspaceTarget(entry.target)) {
            findings.push(
              advisory(
                RULE_ID,
                "error",
                `File contents entry ${index + 1} uses unsafe workspace target '${entry.target}'. Use a relative target that stays outside .axm/.`,
                CONTEXT_FILES_JSON,
              ),
            );
          }
          if (entry.mode === "sync-always") {
            wholeFileTargets.set(entry.target, (wholeFileTargets.get(entry.target) ?? 0) + 1);
          }
        }

        for (const [target, count] of wholeFileTargets) {
          if (count <= 1) {
            continue;
          }
          findings.push(
            advisory(
              RULE_ID,
              "warning",
              `Multiple sync-always entries write whole-file target '${target}'. Keep only one owner for that target to avoid nondeterministic materialization.`,
              CONTEXT_FILES_JSON,
            ),
          );
        }

        return findings;
      })(),
    ),
};
