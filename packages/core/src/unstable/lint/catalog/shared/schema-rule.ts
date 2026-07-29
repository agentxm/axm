/**
 * Shared schema-delegation plumbing for `-schema-valid` rules.
 *
 * Per `contributing/guides/lint-rule-authoring.md` ("Schema-Valid vs
 * Keys-Recognized Split"), every rule whose id ends in `-schema-valid` implements `check` by
 * running the canonical schema through `Schema.decodeUnknownResult` with
 * `onExcessProperty: "ignore"` and `errors: "all"`, then mapping the issues
 * through `issuesToFindings`.
 *
 * Phase 3a is the first catalog; landing the helper now keeps the Phase 3b
 * pack catalog from duplicating the composition when it arrives. The helper is
 * intentionally narrow — only the surface the `-schema-valid` rules need.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describeSchemaDocument } from "../../describe-document.js";
import { issuesToFindings } from "../../issues-to-findings.js";
import type { AdvisoryFinding, Severity } from "../../rule.js";
import { isManifestJsonParseFailure, manifestJsonParseFailureToFinding } from "./manifest-json.js";

// -----------------------------------------------------------------------------
// schemaDecodeFindings
// -----------------------------------------------------------------------------

/**
 * Decode `input` against `schema` (excess keys ignored, all issues collected)
 * and return one advisory finding per leaf issue. Success produces `[]`.
 *
 * `input` of `undefined` short-circuits to `[]` — the caller is expected to
 * have already guarded on "manifest exists" via the complementary
 * `-present` rule.
 *
 * @param ruleId   - `<namespace>/<name>` id of the calling rule.
 * @param severity - Severity to stamp on each emitted finding.
 * @param file     - Accessor-relative file path to stamp on `location.file`.
 * @param schema   - Canonical Effect schema; `Schema.decodeUnknownResult`
 *                   runs with `onExcessProperty: "ignore"` and `errors: "all"`.
 * @param input    - Raw decoded JSON value to check (typically `subject.*Json`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const schemaDecodeFindings = <A, I>(
  ruleId: string,
  severity: Severity,
  file: string,
  schema: Schema.Codec<A, I>,
  input: unknown,
): Effect.Effect<ReadonlyArray<AdvisoryFinding>> => {
  if (input === undefined) {
    return Effect.succeed([]);
  }
  if (isManifestJsonParseFailure(input)) {
    return Effect.succeed([manifestJsonParseFailureToFinding(ruleId, severity, file, input)]);
  }
  const result = Schema.decodeUnknownResult(schema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  if (Result.isSuccess(result)) {
    return Effect.succeed([]);
  }
  return Effect.succeed(issuesToFindings(ruleId, severity, file, result.failure.issue));
};

// -----------------------------------------------------------------------------
// enumerateUnknownTopLevelKeys
// -----------------------------------------------------------------------------

/**
 * Read the top-level field names of a `Schema.Struct` value.
 *
 * Callers produce an `allowedKeys` set in one place, driven by the schema
 * itself — no copy-paste of field names into rule bodies. If the schema
 * gains a field the allowed-keys set grows by construction.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const structFieldKeys = (struct: {
  readonly fields: Readonly<Record<string, unknown>>;
}): ReadonlySet<string> => new Set(Object.keys(struct.fields));

/**
 * Enumerate top-level keys present on `input` that are not declared by
 * `allowedKeys`. Returns one advisory finding per unknown key.
 *
 * `input` of `undefined` or non-object short-circuits to `[]`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const enumerateUnknownTopLevelKeys = (
  ruleId: string,
  severity: Severity,
  file: string,
  allowedKeys: ReadonlySet<string>,
  input: unknown,
): ReadonlyArray<AdvisoryFinding> => {
  if (isManifestJsonParseFailure(input)) {
    return [];
  }
  if (!isPlainRecord(input)) {
    return [];
  }
  const findings: Array<AdvisoryFinding> = [];
  for (const key of Object.keys(input)) {
    if (allowedKeys.has(key)) {
      continue;
    }
    findings.push({
      kind: "advisory",
      ruleId,
      severity,
      message:
        `${describeSchemaDocument(file)} has unrecognized top-level field '${key}'. ` +
        `Edit \`${file}\` to remove it or rename it to the intended field name.`,
      location: { file },
    });
  }
  return findings;
};

const isPlainRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
