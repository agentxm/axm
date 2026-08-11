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
 * Composite nodes recurse into their children. Each finding's `message`
 * is branch-specific and guide-conformant: invariant failure first, raw
 * schema detail second when needed, remediation last. `location.file` is the
 * caller-supplied file (the manifest file); v1 does not parse byte positions
 * out of `Issue` values.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as SchemaIssue from "effect/SchemaIssue";
import { describeSchemaDocument } from "./describe-document.js";
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
  issue: SchemaIssue.Issue,
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

type Visitor = (issue: SchemaIssue.Issue, path: ReadonlyArray<PropertyKey>) => void;

const walkIssue = (
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey>,
  visit: Visitor,
): void => {
  switch (issue._tag) {
    case "Pointer": {
      walkIssue(issue.issue, [...path, ...issue.path], visit);
      return;
    }
    case "Composite":
    case "AnyOf": {
      if (issue.issues.length === 0) {
        // No union member matched / no nested issues — treat as a leaf so
        // the caller sees at least one finding for the covering diagnostic.
        visit(issue, path);
        return;
      }
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
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey>,
): AdvisoryFinding => {
  return {
    kind: "advisory",
    ruleId,
    severity,
    message: formatIssueMessage(describeSchemaDocument(file), file, issue, path),
    location: { file },
  };
};

const formatIssueMessage = (
  documentLabel: string,
  file: string,
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<PropertyKey>,
): string => {
  const pathStr = formatPath(path);
  const valueRef = describeValueReference(documentLabel, pathStr);

  switch (issue._tag) {
    case "MissingKey":
      return formatMissingKeyMessage(documentLabel, file, path, pathStr);
    case "UnexpectedKey":
      return formatUnexpectedKeyMessage(documentLabel, file, pathStr);
    case "InvalidType":
      return `${valueRef} has the wrong type. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "replace it with a value of the expected type")}`;
    case "InvalidValue":
      return `${valueRef} is invalid. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "update it so it satisfies the schema constraint")}`;
    case "Forbidden":
      return `${valueRef} uses a value or operation the schema does not allow. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "update it so the document satisfies the schema")}`;
    case "OneOf":
      return `${valueRef} matches more than one allowed shape. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "rewrite it so exactly one allowed shape matches")}`;
    case "AnyOf":
      return `${valueRef} does not match any allowed shape. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "rewrite it so it matches one of the allowed shapes")}`;
    case "Filter":
      return `${valueRef} fails a schema constraint. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "update it so it satisfies the constraint")}`;
    case "Encoding":
      return `${valueRef} cannot be encoded or decoded as required by the schema. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "update it to the shape the schema expects")}`;
    case "Pointer":
      return `${documentLabel} has a schema problem${pathStr === "" ? "" : ` at ${pathStr}`}. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "fix the value at that path so the document satisfies the schema")}`;
    case "Composite":
      return `${valueRef} has multiple schema problems. Detail: ${formatSchemaIssue(issue)}. ${formatRemediation(file, "fix the referenced values so the document satisfies the schema")}`;
  }
};

const formatSchemaIssue = SchemaIssue.makeFormatterDefault();

const formatMissingKeyMessage = (
  documentLabel: string,
  file: string,
  path: ReadonlyArray<PropertyKey>,
  pathStr: string,
): string => {
  const lastSegment = path[path.length - 1];
  const parentPath = formatPath(path.slice(0, -1));
  if (typeof lastSegment === "string" && pathStr !== "") {
    return parentPath === ""
      ? `${documentLabel} is missing required field \`${pathStr}\`. ${formatRemediation(file, `add \`${lastSegment}\``)}`
      : `${documentLabel} is missing required field \`${pathStr}\`. ${formatRemediation(file, `add \`${lastSegment}\` under \`${parentPath}\``)}`;
  }
  if (lastSegment !== undefined && pathStr !== "") {
    return `${documentLabel} is missing a required item at \`${pathStr}\`. ${formatRemediation(file, "add the missing item at that path")}`;
  }
  return `${documentLabel} is missing a required value. ${formatRemediation(file, "add the required value")}`;
};

const formatUnexpectedKeyMessage = (
  documentLabel: string,
  file: string,
  pathStr: string,
): string =>
  pathStr === ""
    ? `${documentLabel} has an unrecognized field. ${formatRemediation(file, "remove it or rename it to the intended field name")}`
    : `${documentLabel} has unrecognized field \`${pathStr}\`. ${formatRemediation(file, "remove it or rename it to the intended field name")}`;

const describeValueReference = (documentLabel: string, pathStr: string): string =>
  pathStr === "" ? documentLabel : `${documentLabel} field \`${pathStr}\``;

const formatRemediation = (file: string, manualAction: string): string =>
  isLockfile(file)
    ? "Regenerate `.axm/axm-lock.yaml` from `.axm/settings.json` by reinstalling the declared extensions."
    : `Edit \`${file}\` and ${manualAction}.`;

const formatPath = (path: ReadonlyArray<PropertyKey>): string =>
  path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") {
      return `${acc}[${String(segment)}]`;
    }
    return acc === "" ? String(segment) : `${acc}.${String(segment)}`;
  }, "");

const basename = (file: string): string => {
  const normalized = file.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
};

const isLockfile = (file: string): boolean => basename(file) === "axm-lock.yaml";
