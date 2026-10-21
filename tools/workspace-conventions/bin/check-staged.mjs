#!/usr/bin/env node
// Starts the staged commit gate from a Git pre-commit hook:
//
//   node node_modules/@agentxm/workspace-conventions/bin/check-staged.mjs <checks-file>
//
// The hook must not start this through pnpm or another package manager, which
// would parse possibly unstaged manifests before lint-staged isolates the
// index. This launcher reads no workspace manifest either: it resolves its own
// gate script and the installed lint-staged entry point, then hands over.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  process.stderr.write(`check-staged: ${message}\n`);
  process.exit(2);
}

const [checks, ...extra] = process.argv.slice(2);
if (checks === undefined || extra.length > 0)
  fail("usage: check-staged.mjs <checks-file>, the repository's ordered staged checks.");
const checksPath = resolve(checks);
if (!statSync(checksPath, { throwIfNoEntry: false })?.isFile())
  fail(`the staged checks file ${checks} does not exist.`);

let lintStaged = "";
try {
  lintStaged = createRequire(import.meta.url).resolve("lint-staged/bin");
} catch {
  fail("lint-staged is not installed; add it to the workspace's dev dependencies.");
}

const result = spawnSync("bash", [join(import.meta.dirname, "../src/check-staged.sh")], {
  stdio: "inherit",
  env: {
    ...process.env,
    CHECK_STAGED_CHECKS: checksPath,
    CHECK_STAGED_LINT_STAGED: lintStaged,
  },
});
if (result.error) fail(`cannot start bash: ${result.error.message}`);
if (result.signal) process.kill(process.pid, result.signal);
process.exitCode = result.status ?? 1;
