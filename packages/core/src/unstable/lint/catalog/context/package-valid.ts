import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ContextRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import {
  advisory,
  decodeContextManifest,
  CONTEXT_JSON,
  sourcePaths,
  SRC_ROOT,
  srcPath,
} from "./helpers.js";

const RULE_ID = "context/package-valid";

export const packageValidRule: AdvisoryRule<ContextRuleContext> = {
  id: RULE_ID,
  description: "context.json references existing payload files and no orphan src/ payloads.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const manifest = decodeContextManifest(context.subject.contextJson);
      if (Option.isNone(manifest)) {
        return [];
      }

      const referenced = new Set<string>();
      const findings: Array<AdvisoryFinding> = [];
      for (const entry of manifest.value.contents) {
        if (entry.source.kind === "generated") {
          continue;
        }
        for (const payloadPath of sourcePaths(entry.source)) {
          const file = srcPath(payloadPath);
          referenced.add(file);
          const exists = yield* context.files.exists(file);
          if (!exists) {
            findings.push(
              advisory(
                RULE_ID,
                "error",
                `File payload '${payloadPath}' is referenced by context.json but is missing under src/. Add \`${file}\` or update the contents entry.`,
                CONTEXT_JSON,
              ),
            );
          }
        }
      }

      const payloadFiles = yield* context.files
        .listFiles(SRC_ROOT)
        .pipe(Effect.catch(() => Effect.succeed([])));
      for (const payloadFile of payloadFiles) {
        if (referenced.has(payloadFile)) {
          continue;
        }
        findings.push(
          advisory(
            RULE_ID,
            "warning",
            `File payload '${payloadFile}' is present under src/ but no context.json contents entry references it. Remove the orphan payload or add it to contents.`,
            payloadFile,
          ),
        );
      }

      return findings;
    }),
};
