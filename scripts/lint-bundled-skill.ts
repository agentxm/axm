/**
 * Lint the bundled AXM skill through the in-flight CLI.
 *
 * Usage:
 *   bun lint-bundled-skill.ts
 *
 * Implementation of the published `axm:lint-bundled-skill` target. Under
 * docs/guides/repository-task-interface.md and the portable task-interface
 * guide it binds, this file is reached through that target, never by path —
 * that is what lets a developer reproduce the CI `extension-lint` job by
 * name.
 *
 * The CLI's diagnostics stream straight through to the caller and its exit
 * status is inspected rather than masked: a lint run that never happened must
 * never look like a clean bundled skill. `axm lint` exits 1
 * (`ExitCode.Issues`) when it ran and reported findings anywhere in the
 * workspace, so 0 and 1 are the only statuses that mean the tool did its job.
 * Any other status is a tool failure and is propagated verbatim.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createAxmLocalInvocation } from "./axm-local-shared.js";

/**
 * Workspace-relative root of the one skill this check owns.
 *
 * This is the workspace-authored source root — the same `{workspaceRoot}/skills/axm/**`
 * that `cli:build` and `cli:generate:bundled-axm-skill` declare as inputs. Lint
 * findings report both `displayRoot` and `path` relative to the workspace root,
 * so this is the prefix they carry for this skill.
 */
const BUNDLED_SKILL_ROOT = "skills/axm";

/** `axm lint` statuses that mean the linter ran: success and `ExitCode.Issues`. */
const LINT_COMPLETED_STATUSES: ReadonlySet<number> = new Set([0, 1]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  return typeof value === "string" ? value : "";
};

const readFindings = (payload: unknown): ReadonlyArray<Record<string, unknown>> => {
  if (!isRecord(payload)) {
    throw new Error("lint output is not a JSON object");
  }
  const result = payload["result"];
  if (!isRecord(result)) {
    throw new Error("lint output has no `result` object");
  }
  const findings = result["findings"];
  if (!Array.isArray(findings)) {
    throw new Error("lint output has no `result.findings` array");
  }
  const entries: ReadonlyArray<unknown> = findings;
  return entries.filter(isRecord);
};

const parseFindings = (raw: string): ReadonlyArray<Record<string, unknown>> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return readFindings(parsed);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error(`Could not read \`axm lint --json\` output: ${detail}`);
    console.error(raw);
    process.exit(1);
  }
};

const locates = (finding: Record<string, unknown>, root: string): boolean =>
  `${readString(finding, "path")} ${readString(finding, "displayRoot")}`
    .replaceAll("\\", "/")
    .includes(root);

const invocation = createAxmLocalInvocation({
  scriptPath: fileURLToPath(import.meta.url),
  argv: ["lint", "--json", "--quiet", "--non-interactive"],
  cwd: process.cwd(),
  env: process.env,
});

const lint = spawnSync(invocation.command, invocation.args, {
  cwd: invocation.cwd,
  env: invocation.env,
  encoding: "utf8",
  // Result output is captured; diagnostic output is inherited so a failing or
  // never-started lint run is visible in the caller's log.
  stdio: ["ignore", "pipe", "inherit"],
});

if (lint.error != null) {
  throw lint.error;
}

if (lint.status === null) {
  console.error(`\`axm lint\` was terminated by signal ${lint.signal ?? "unknown"}.`);
  process.exit(1);
}

if (!LINT_COMPLETED_STATUSES.has(lint.status)) {
  console.error(
    `\`axm lint\` exited with status ${lint.status}; ${BUNDLED_SKILL_ROOT} was not linted.`,
  );
  process.exit(lint.status);
}

const skillErrors = parseFindings(lint.stdout).filter(
  (finding) => readString(finding, "severity") === "error" && locates(finding, BUNDLED_SKILL_ROOT),
);

if (skillErrors.length > 0) {
  console.error(`Bundled AXM skill has ${skillErrors.length} lint error(s):`);
  for (const finding of skillErrors) {
    console.error(JSON.stringify(finding, null, 2));
  }
  process.exit(1);
}

console.log(`Bundled AXM skill passed lint (${BUNDLED_SKILL_ROOT})`);
