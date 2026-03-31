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

import { releaseVersion as nxReleaseVersion } from "nx/release/index.js";

import {
  currentHeadSha,
  fetchOriginMain,
  fail,
  parseBumpType,
  releaseTagFromVersion,
  requireCleanWorkingTree,
  requireMainBranch,
  requireMatchingReleasePackageVersions,
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

  const version = requireMatchingReleasePackageVersions();
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

const requireWorkspaceVersion = (workspaceVersion: string | null | undefined): string =>
  workspaceVersion ?? fail("Expected Nx Release to produce a fixed workspace version.");

const bumpVersions = async () => {
  console.log("\n==> Phase 2: Bump versions");
  const { workspaceVersion } = await nxReleaseVersion({
    specifier: bumpType,
    dryRun,
    stageChanges: !dryRun,
    gitCommit: !dryRun,
    gitCommitMessage: "release: cli-v{version}",
    gitTag: false,
    gitPush: false,
  });

  const version = requireWorkspaceVersion(workspaceVersion);
  if (!dryRun) {
    const appliedVersion = requireMatchingReleasePackageVersions();
    if (appliedVersion !== version) {
      fail(`Nx Release reported ${version}, but package versions on disk are ${appliedVersion}.`);
    }
  }

  const tag = releaseTagFromVersion(version);
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  return { version, tag };
};

const pushReleaseCommit = (tag: string) => {
  console.log("\n==> Phase 3: Push");
  run("git", ["push", "origin", "main"]);

  const sha = currentHeadSha();
  const version = tag.replace("cli-v", "");
  console.log(`\nPrepared ${tag}`);
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  console.log(`  Commit: ${sha}`);
  console.log(`  Next: wait for CI on ${sha} to pass, then run pnpm release:publish ${tag}`);
};

const main = async () => {
  preflight();
  verify();

  const { tag } = await bumpVersions();
  if (dryRun) {
    console.log(`\nDry run complete. Would prepare ${tag} (${bumpType}).`);
    return;
  }

  pushReleaseCommit(tag);
};

void main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
