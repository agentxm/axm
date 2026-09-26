/**
 * Compose the policy-required evidence for one exact release candidate.
 *
 * Usage:
 *   bun verify-release.ts --candidate cli-vX.Y.Z
 *
 * The release policy in devops/runbooks/release-cli.md owns the selection
 * and acceptance criteria; this gate applies it to the named candidate and
 * fails clearly when no exact candidate is identified. It composes existing
 * evidence targets rather than owning duplicate test outcomes.
 */

import { execFileSync, spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");

const argumentIndex = process.argv.indexOf("--candidate");
const candidate = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : undefined;

if (candidate === undefined || candidate.length === 0) {
  console.error("verify:release requires one exact candidate: pass --candidate cli-vX.Y.Z.");
  process.exit(1);
}

const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

const phases: ReadonlyArray<{ readonly label: string; readonly command: readonly string[] }> = [
  {
    label: `Validate candidate tag ${candidate} at HEAD`,
    command: [
      "exec",
      "nx",
      "run",
      "axm:resolve-release-meta",
      "--outputStyle=static",
      "--",
      candidate,
      headSha,
    ],
  },
  {
    label: "Full verification (lint, typecheck, build, tests, specifications, e2e)",
    command: ["run", "ci"],
  },
];

for (const phase of phases) {
  console.log(`\n== ${phase.label}`);
  const run = spawnSync("pnpm", [...phase.command], { cwd: repoRoot, stdio: "inherit" });
  if (run.status !== 0) {
    console.error(`Release verification failed for candidate ${candidate}: ${phase.label}`);
    process.exit(run.status ?? 1);
  }
}

console.log(
  `\nRelease verification passed for candidate ${candidate}. Binary, installed-product, and platform evidence is composed by the release workflow for the same tag.`,
);
