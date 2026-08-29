/**
 * `workspace/settings-keys-recognized` — `axm.json` uses only
 * supported top-level keys.
 *
 * `SettingsSchema` tolerates and preserves unknown top-level keys so a write
 * never destroys data it did not create; this rule is the guardrail that
 * surfaces those keys loudly. It early-returns when the file is missing or
 * unparsable (`workspace/initialized` and `workspace/settings-schema-valid`
 * own those arms).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { SETTINGS_KNOWN_KEYS } from "../../../settings/schema.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { settingsDisplayPath } from "./display-paths.js";
import { EMPTY_ADVISORY_FINDINGS } from "./helpers/empty.js";

const RULE_ID = "workspace/settings-keys-recognized";

const levenshteinDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? 0;
      const substitution = left[leftIndex - 1] === right[rightIndex - 1] ? diagonal : diagonal + 1;
      previous[rightIndex] = Math.min(above + 1, (previous[rightIndex - 1] ?? 0) + 1, substitution);
      diagonal = above;
    }
  }
  return previous[right.length] ?? 0;
};

const closestKnownKey = (key: string): string | undefined => {
  const lowered = key.toLowerCase();
  let best: { readonly candidate: string; readonly distance: number } | undefined;
  for (const candidate of SETTINGS_KNOWN_KEYS) {
    if (candidate.toLowerCase() === lowered) return candidate;
    const distance = levenshteinDistance(key, candidate);
    if (distance <= 2 && (best === undefined || distance < best.distance)) {
      best = { candidate, distance };
    }
  }
  return best?.candidate;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// `workspace/settings-schema-valid` owns the invalid-JSON arm; this rule stays
// quiet unless the bytes parse to a plain object.
const parseJsonRecord = (raw: string): Readonly<Record<string, unknown>> | undefined => {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const settingsKeysRecognizedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Workspace settings use only supported top-level keys.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const raw = yield* Effect.result(context.workspace.state.raw("settings"));
      if (Result.isFailure(raw) || Option.isNone(raw.success)) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      const parsed = parseJsonRecord(raw.success.value.bytes);
      if (parsed === undefined) {
        return EMPTY_ADVISORY_FINDINGS;
      }

      return Object.keys(parsed)
        .filter((key) => !SETTINGS_KNOWN_KEYS.has(key))
        .map((key): AdvisoryFinding => {
          const hint = closestKnownKey(key);
          return {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message:
              `Workspace settings has unrecognized top-level key '${key}'.` +
              (hint === undefined ? "" : ` Did you mean '${hint}'?`) +
              ` The current settings schema does not recognize this key.`,
            location: { file: settingsDisplayPath(context.subject.scope) },
          };
        });
    }),
};
