/**
 * `issuesToFindings` — shared schema-delegation helper.
 *
 * `-schema-valid` rules delegate their `check` to Effect Schema via
 * `Schema.decodeUnknownResult(schema, { onExcessProperty: "ignore" })` (or the
 * Effect/Exit equivalents) and map the resulting `Issue` tree 1:1 to
 * `AdvisoryFinding`s through this helper. Rules never re-implement schema
 * checks inline; the paired `-keys-recognized` rule owns unknown-key hygiene
 * at warning severity.
 *
 * The helper walks the recursive `SchemaIssue.Issue` tree, accumulating a
 * path at each `Pointer` node and emitting one finding per leaf issue.
 * Composite nodes recurse into their children. Each finding's `message` comes
 * from the default `toString()` representation of the leaf issue, which is
 * the Effect-formatted diagnostic. `location.file` is the caller-supplied
 * file (the manifest file); v1 does not parse byte positions out of `Issue`
 * values.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Issue } from "effect/SchemaIssue";
import type { AdvisoryFinding, Severity } from "./rule.js";

// -----------------------------------------------------------------------------
// Public helper
// -----------------------------------------------------------------------------

/**
 * Walk an `Issue` tree and produce one finding per leaf issue.
 *
 * @param ruleId    - `<namespace>/<name>` id of the calling rule.
 * @param severity  - Severity to stamp on each emitted finding.
 * @param file      - Accessor-relative file path to stamp on `location.file`.
 * @param issue     - Root `Issue` produced by `Schema.decodeUnknown*`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const issuesToFindings = (
  ruleId: string,
  severity: Severity,
  file: string,
  issue: Issue,
): ReadonlyArray<AdvisoryFinding> => {
  const findings: Array<AdvisoryFinding> = [];
  walkIssue(issue, [], (leaf, path) => {
    findings.push(toFinding(ruleId, severity, file, leaf, path));
  });
  return findings;
};

// -----------------------------------------------------------------------------
// Internal walk
// -----------------------------------------------------------------------------

type Visitor = (issue: Issue, path: ReadonlyArray<PropertyKey>) => void;

const walkIssue = (issue: Issue, path: ReadonlyArray<PropertyKey>, visit: Visitor): void => {
  switch (issue._tag) {
    case "Pointer": {
      walkIssue(issue.issue, [...path, ...issue.path], visit);
      return;
    }
    case "Composite":
    case "AnyOf": {
      for (const child of issue.issues) {
        walkIssue(child, path, visit);
      }
      return;
    }
    case "Filter":
    case "Encoding": {
      walkIssue(issue.issue, path, visit);
      return;
    }
    case "InvalidType":
    case "InvalidValue":
    case "MissingKey":
    case "UnexpectedKey":
    case "Forbidden":
    case "OneOf": {
      visit(issue, path);
      return;
    }
  }
};

const toFinding = (
  ruleId: string,
  severity: Severity,
  file: string,
  issue: Issue,
  path: ReadonlyArray<PropertyKey>,
): AdvisoryFinding => {
  const pathStr = formatPath(path);
  const message = pathStr === "" ? String(issue) : `${pathStr}: ${String(issue)}`;
  return {
    kind: "advisory",
    ruleId,
    severity,
    message,
    suggestions: [],
    location: { file },
  };
};

const formatPath = (path: ReadonlyArray<PropertyKey>): string =>
  path
    .map((segment) => {
      if (typeof segment === "number") {
        return `[${String(segment)}]`;
      }
      return String(segment);
    })
    .join(".");
