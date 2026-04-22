/**
 * `workspace/settings-schema-valid` — `.axm/settings.json` conforms to
 * `SettingsSchema`.
 *
 * Cascade per `docs/design/lint-engine.md §10.workspace`:
 *
 * 1. `.axm/settings.json` is present (`workspace/initialized` owns the
 *    absence arm; this rule early-returns when the file is missing).
 * 2. The file parses as JSON (the accessor surfaces parse failures via
 *    `SettingsReadError`; we emit one finding per read failure).
 * 3. The parsed value is a JSON object (not an array or scalar) — enforced
 *    by `Schema.decodeUnknownResult(SettingsSchema)` structurally.
 * 4. `Schema.decodeUnknownResult(SettingsSchema)` with
 *    `onExcessProperty: "ignore"` succeeds; `ParseResult` issues map 1:1 to
 *    findings via `schemaDecodeFindings`.
 *
 * Reports the read-failure finding when arm 2 fails; otherwise reports the
 * schema issues produced by arm 3/4. The design doc notes the unknown-key
 * companion (`workspace/settings-keys-recognized`) defers to v1.5+ — this
 * rule keeps schema validity as a single error-severity invariant.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryRule } from "../../rule.js";
import { SettingsSchema } from "../../../settings/schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/settings-schema-valid";
const SETTINGS_REL = ".axm/settings.json";

export const settingsSchemaValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Workspace settings are structurally valid.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      // Early-return when settings.json is absent; workspace/initialized owns
      // that arm so a fresh workspace surfaces exactly one finding.
      const exists = yield* context.workspace.exists(SETTINGS_REL);
      if (!exists) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const read = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(read)) {
        const error = read.failure;
        return [
          {
            kind: "advisory" as const,
            ruleId: RULE_ID,
            severity: "error" as const,
            message:
              `The workspace settings file is not valid JSON. Detail: ${error.message}. ` +
              "Edit `.axm/settings.json` to fix the JSON syntax.",
            location: { file: SETTINGS_REL },
          },
        ];
      }

      // The accessor returns the raw parsed JSON value; we run the schema
      // decode here so issues surface 1:1 as findings.
      const decodedFindings = yield* schemaDecodeFindings(
        RULE_ID,
        "error",
        SETTINGS_REL,
        SettingsSchema,
        read.success,
      );
      return decodedFindings;
    }),
};
