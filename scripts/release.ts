/**
 * Automated release pipeline: verify → bump → commit → push → GitHub Release.
 *
 * Usage:
 *   bun scripts/release.ts <patch|minor|major> [--dry-run]
 *
 * Examples:
 *   bun scripts/release.ts patch
 *   bun scripts/release.ts minor --dry-run
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BUMP_TYPE = process.argv[2];
const DRY_RUN = process.argv.includes("--dry-run");

if (!BUMP_TYPE || !["patch", "minor", "major"].includes(BUMP_TYPE)) {
  console.error("Usage: bun scripts/release.ts <patch|minor|major> [--dry-run]");
  process.exit(1);
}

const NX_ENV = {
  ...process.env,
  NX_TUI: "false",
  NX_DEFAULT_OUTPUT_STYLE: "static",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = (command: string, args: readonly string[], env?: NodeJS.ProcessEnv) => {
  console.log(`\n==> ${command} ${args.join(" ")}`);
  execFileSync(command, [...args], { stdio: "inherit", env: env ?? process.env });
};

const runNx = (...args: readonly string[]) =>
  run("pnpm", ["exec", "nx", ...args, "--outputStyle=static"], NX_ENV);

const readPackageVersion = (path: string): string => {
  const pkg = JSON.parse(readFileSync(path, "utf8")) as { version: string };
  return pkg.version;
};

const git = (...args: readonly string[]): string =>
  execFileSync("git", [...args], { encoding: "utf8" }).trim();

// ---------------------------------------------------------------------------
// Preflight checks
// ---------------------------------------------------------------------------

const preflight = () => {
  console.log("==> Preflight checks");

  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") {
    console.error(`Must be on main branch (currently on ${branch})`);
    process.exit(1);
  }

  const status = git("status", "--porcelain");
  if (status.length > 0) {
    console.error("Working tree is not clean. Commit or stash changes first.");
    process.exit(1);
  }

  git("fetch", "origin", "main");
  const behind = git("rev-list", "--count", "HEAD..origin/main");
  if (behind !== "0") {
    console.error(`Local main is ${behind} commit(s) behind origin/main. Pull first.`);
    process.exit(1);
  }

  const coreVersion = readPackageVersion("packages/core/package.json");
  const cliVersion = readPackageVersion("packages/cli/package.json");
  if (coreVersion !== cliVersion) {
    console.error(
      `Version mismatch: core=${coreVersion}, cli=${cliVersion}. Fix before releasing.`,
    );
    process.exit(1);
  }

  console.log(`  Branch: main`);
  console.log(`  Current version: ${coreVersion}`);
  console.log(`  Bump type: ${BUMP_TYPE}`);
  if (DRY_RUN) console.log(`  Mode: dry-run`);
};

// ---------------------------------------------------------------------------
// Phase 1: Verify
// ---------------------------------------------------------------------------

const verify = () => {
  console.log("\n==> Phase 1: Verify");
  runNx("format:check");
  runNx("run-many", "-t", "lint", "typecheck", "build", "test", "e2e", "--nxBail");
};

// ---------------------------------------------------------------------------
// Phase 2: Bump versions
// ---------------------------------------------------------------------------

const bump = (): { version: string; tag: string } => {
  console.log("\n==> Phase 2: Bump versions");
  run("pnpm", [
    "--filter",
    "@axm.sh/core",
    "exec",
    "npm",
    "version",
    BUMP_TYPE,
    "--no-git-tag-version",
  ]);
  run("pnpm", [
    "--filter",
    "@axm.sh/cli",
    "exec",
    "npm",
    "version",
    BUMP_TYPE,
    "--no-git-tag-version",
  ]);

  const version = readPackageVersion("packages/cli/package.json");
  const tag = `cli-v${version}`;
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  return { version, tag };
};

// ---------------------------------------------------------------------------
// Phase 3: Commit, push, create GitHub Release
// ---------------------------------------------------------------------------

const publish = (version: string, tag: string) => {
  console.log("\n==> Phase 3: Commit, push, release");
  run("git", ["add", "packages/core/package.json", "packages/cli/package.json"]);
  run("git", ["commit", "-m", `release: ${tag}`]);
  run("git", ["push", "origin", "main"]);
  run("gh", ["release", "create", tag, "--title", `cli v${version}`, "--generate-notes"]);
  console.log(`\nReleased ${tag}`);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = () => {
  preflight();
  verify();

  if (DRY_RUN) {
    const coreVersion = readPackageVersion("packages/core/package.json");
    console.log(`\nDry run complete. Would bump ${coreVersion} (${BUMP_TYPE}) and release.`);
    return;
  }

  const { version, tag } = bump();
  publish(version, tag);
};

main();
