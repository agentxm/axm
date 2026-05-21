import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ContextRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import {
  advisory,
  containsAxmRegionMarker,
  decodeContextManifest,
  CONTEXT_JSON,
  markerStyleForTarget,
  readPayloadString,
  sourcePaths,
  srcPath,
} from "./helpers.js";

const RULE_ID = "context/marker-valid";

export const markerValidRule: AdvisoryRule<ContextRuleContext> = {
  id: RULE_ID,
  description:
    "Managed-region entries use comment-capable targets and whole-file payloads do not embed AXM markers.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const manifest = decodeContextManifest(context.subject.contextJson);
      if (Option.isNone(manifest)) {
        return [];
      }

      const findings: Array<AdvisoryFinding> = [];
      for (const [index, entry] of manifest.value.contents.entries()) {
        if (entry.mode === "managed-region" && Option.isNone(markerStyleForTarget(entry.target))) {
          findings.push(
            advisory(
              RULE_ID,
              "error",
              `File contents entry ${index + 1} uses managed-region mode for comment-less target '${entry.target}'. Use a comment-capable target or whole-file mode.`,
              CONTEXT_JSON,
            ),
          );
        }

        if (entry.mode !== "sync-always" || entry.source.kind === "generated") {
          continue;
        }
        for (const payloadPath of sourcePaths(entry.source)) {
          const content = yield* readPayloadString(context, payloadPath);
          if (Option.isNone(content) || !containsAxmRegionMarker(content.value, entry.target)) {
            continue;
          }
          findings.push(
            advisory(
              RULE_ID,
              "error",
              `Sync-always payload '${payloadPath}' embeds AXM managed-region markers. Remove markers from whole-file payloads or use managed-region mode.`,
              srcPath(payloadPath),
            ),
          );
        }
      }

      return findings;
    }),
};
