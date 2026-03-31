/**
 * Automated release preparation pipeline: verify -> bump -> commit -> push.
 *
 * Usage:
 *   bun scripts/release-prepare.ts <patch|minor|major> [--dry-run]
 *
 * Examples:
 *   bun scripts/release-prepare.ts patch
 *   bun scripts/release-prepare.ts minor --dry-run
 */

import {
  currentHeadSha,
  fetchOriginMain,
  fail,
  parseBumpType,
  previewVersionBump,
  releaseTagFromVersion,
  requireCleanWorkingTree,
  requireMainBranch,
  requireMatchingPackageVersions,
  requireNotBehindOriginMain,
  run,
} from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: bun scripts/release-prepare.ts <patch|minor|major> [--dry-run]");
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry-run");
if (unknownFlags.length > 0) {
  fail(`Unknown flag(s): ${unknownFlags.join(", ")}`);
}

const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
if (positionalArgs.length !== 1) {
  fail("Usage: bun scripts/release-prepare.ts <patch|minor|major> [--dry-run]");
}

const bumpType = parseBumpType(
  positionalArgs[0] ??
    fail("Usage: bun scripts/release-prepare.ts <patch|minor|major> [--dry-run]"),
);

const preflight = () => {
  console.log("==> Preflight checks");

  requireMainBranch();
  requireCleanWorkingTree();
  fetchOriginMain();
  requireNotBehindOriginMain();

  const version = requireMatchingPackageVersions();
  console.log(`  Branch: main`);
  console.log(`  Current version: ${version}`);
  console.log(`  Bump type: ${bumpType}`);
  if (dryRun) {
    console.log("  Mode: dry-run");
  }
};

const verify = () => {
  console.log("\n==> Phase 1: Verify");
  run("pnpm", ["verify"]);
};

const bumpVersions = () => {
  console.log("\n==> Phase 2: Bump versions");
  run("pnpm", [
    "--filter",
    "@axm.sh/core",
    "exec",
    "npm",
    "version",
    bumpType,
    "--no-git-tag-version",
  ]);
  run("pnpm", [
    "--filter",
    "@axm.sh/cli",
    "exec",
    "npm",
    "version",
    bumpType,
    "--no-git-tag-version",
  ]);

  const version = requireMatchingPackageVersions();
  const tag = releaseTagFromVersion(version);
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  return { version, tag };
};

const pushReleaseCommit = (tag: string) => {
  console.log("\n==> Phase 3: Commit and push");
  run("git", ["add", "packages/core/package.json", "packages/cli/package.json"]);
  run("git", ["commit", "-m", `release: ${tag}`]);
  run("git", ["push", "origin", "main"]);

  const sha = currentHeadSha();
  const version = tag.replace("cli-v", "");
  console.log(`\nPrepared ${tag}`);
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  console.log(`  Commit: ${sha}`);
  console.log(`  Next: wait for CI on ${sha} to pass, then run pnpm release:publish ${tag}`);
};

const main = () => {
  preflight();
  verify();

  if (dryRun) {
    const version = previewVersionBump(requireMatchingPackageVersions(), bumpType);
    console.log(
      `\nDry run complete. Would prepare ${releaseTagFromVersion(version)} (${bumpType}).`,
    );
    return;
  }

  const { tag } = bumpVersions();
  pushReleaseCommit(tag);
};

main();
