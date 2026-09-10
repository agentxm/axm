/**
 * Schema issue formatting for decode results.
 *
 * Deliberately a local copy of the extension model's formatter: this tooling
 * package is imported by specifications inside the extension model itself,
 * so a dependency on the model would make the two projects' builds circular.
 */

import * as SchemaIssue from "effect/SchemaIssue";

const DEFAULT_MAX_ISSUES = 5;

/**
 * Format a schema validation issue into human-readable lines with
 * dot-notation paths, capped at `maxIssues` lines.
 */
export const formatSchemaIssuesToLines = (
  issue: SchemaIssue.Issue,
  maxIssues: number = DEFAULT_MAX_ISSUES,
): ReadonlyArray<string> => {
  const formatter = SchemaIssue.makeFormatterStandardSchemaV1();
  const { issues } = formatter(issue);
  const lines: Array<string> = [];
  for (const item of issues) {
    const path = item.path;
    if (path !== undefined && path.length > 0) {
      const segments = path.map((segment) => {
        if (typeof segment === "object" && segment !== null && "key" in segment) {
          return String(segment.key);
        }
        return String(segment);
      });
      lines.push(`${segments.join(".")}: ${item.message}`);
    } else {
      lines.push(item.message);
    }
  }
  return lines.slice(0, maxIssues);
};
