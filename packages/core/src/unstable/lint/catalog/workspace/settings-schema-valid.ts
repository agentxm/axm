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
 * 4. `SettingsSchema` decode succeeds; `ParseResult` issues map 1:1 to
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
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding } from "../../rule.js";
import type { AdvisoryRule } from "../../rule.js";
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
      const scoped = context.workspace;
      const raw = yield* Effect.result(scoped.state.raw("settings"));
      if (Result.isSuccess(raw) && Option.isNone(raw.success)) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const settings = yield* Effect.result(scoped.state.settings);
      if (Result.isFailure(settings)) {
        const error = settings.failure;
        if (error._tag === "SettingsDecodeError") {
          return error.issues.map((issue): AdvisoryFinding => ({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: `The workspace settings file does not match the expected schema. Detail: ${issue}. Edit \`${SETTINGS_REL}\` to fix the invalid value.`,
            location: { file: SETTINGS_REL },
          }));
        }
        return [
          {
            kind: "advisory" as const,
            ruleId: RULE_ID,
            severity: "error" as const,
            message:
              `The workspace settings file is not valid JSON. Detail: ${error._tag}. ` +
              "Edit `.axm/settings.json` to fix the JSON syntax.",
            location: { file: SETTINGS_REL },
          },
        ];
      }

      return EMPTY_ADVISORY_FINDINGS;
    }),
};
