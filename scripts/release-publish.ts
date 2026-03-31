/**
 * Publish a GitHub release after CI succeeds for the release commit.
 *
 * Usage:
 *   bun scripts/release-publish.ts <cli-vX.Y.Z> [--dry-run]
 *
 * Examples:
 *   bun scripts/release-publish.ts cli-v0.1.0
 *   bun scripts/release-publish.ts cli-v0.1.0 --dry-run
 */

import {
  fetchOriginMain,
  fail,
  RELEASE_REPO,
  releaseCommitOnOriginMain,
  releaseVersionFromTag,
  requireCleanWorkingTree,
  requireMatchingReleasePackageVersionsAtRef,
  requireNoExistingGitHubRelease,
  requireSuccessfulCiRun,
  run,
  validateReleaseTag,
} from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: bun scripts/release-publish.ts <cli-vX.Y.Z> [--dry-run]");
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry-run");
if (unknownFlags.length > 0) {
  fail(`Unknown flag(s): ${unknownFlags.join(", ")}`);
}

const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
if (positionalArgs.length !== 1) {
  fail("Usage: bun scripts/release-publish.ts <cli-vX.Y.Z> [--dry-run]");
}

const requestedTag =
  positionalArgs[0] ?? fail("Usage: bun scripts/release-publish.ts <cli-vX.Y.Z> [--dry-run]");
const tag = validateReleaseTag(requestedTag);
const version = releaseVersionFromTag(tag);

const preflight = () => {
  console.log("==> Publish checks");

  requireCleanWorkingTree();
  fetchOriginMain();
  requireNoExistingGitHubRelease(tag);

  const sha = releaseCommitOnOriginMain(tag);
  const releaseVersion = requireMatchingReleasePackageVersionsAtRef(sha);

  if (releaseVersion !== version) {
    fail(`Release commit ${sha} has version ${releaseVersion}, but requested tag is ${tag}.`);
  }

  const ciRun = requireSuccessfulCiRun(sha);

  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
  console.log(`  Commit: ${sha}`);
  console.log(`  CI run: ${ciRun.url}`);
  if (dryRun) {
    console.log("  Mode: dry-run");
  }

  return { version, tag, sha };
};

const publish = (version: string, tag: string, sha: string) => {
  console.log("\n==> Create GitHub Release");
  run("gh", [
    "release",
    "create",
    tag,
    "--repo",
    RELEASE_REPO,
    "--target",
    sha,
    "--title",
    `cli v${version}`,
    "--generate-notes",
  ]);
  console.log(`\nReleased ${tag}`);
};

const main = () => {
  const { version, tag, sha } = preflight();

  if (dryRun) {
    console.log(`\nDry run complete. Would create GitHub release ${tag} from ${sha}.`);
    return;
  }

  publish(version, tag, sha);
};

main();
