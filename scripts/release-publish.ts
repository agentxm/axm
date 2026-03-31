/**
 * Publish a GitHub release after CI succeeds for the release commit.
 *
 * Usage:
 *   pnpm release:publish -- <cli-vX.Y.Z> [--dry-run]
 *
 * Examples:
 *   pnpm release:publish -- cli-v0.1.0
 *   pnpm release:publish -- cli-v0.1.0 --dry-run
 */

import { ReleaseClient } from "nx/release/index.js";

import {
  fetchOriginMain,
  fail,
  releaseCommitOnOriginMain,
  releaseVersionFromTag,
  requireCleanWorkingTree,
  requireMatchingReleasePackageVersionsAtRef,
  requireNoExistingGitHubRelease,
  requireSuccessfulCiRun,
  validateReleaseTag,
} from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm release:publish -- <cli-vX.Y.Z> [--dry-run]");
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const unknownFlags = args.filter((arg) => arg.startsWith("--") && arg !== "--dry-run");
if (unknownFlags.length > 0) {
  fail(`Unknown flag(s): ${unknownFlags.join(", ")}`);
}

const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
if (positionalArgs.length !== 1) {
  fail("Usage: pnpm release:publish -- <cli-vX.Y.Z> [--dry-run]");
}

const requestedTag =
  positionalArgs[0] ?? fail("Usage: pnpm release:publish -- <cli-vX.Y.Z> [--dry-run]");
const tag = validateReleaseTag(requestedTag);
const version = releaseVersionFromTag(tag);
const releaseClient = new ReleaseClient(
  {
    changelog: {
      workspaceChangelog: {
        createRelease: "github",
        file: false,
      },
      projectChangelogs: false,
    },
  },
  false,
);

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

const publish = async (version: string, tag: string, sha: string) => {
  console.log("\n==> Create GitHub Release");
  const { workspaceChangelog } = await releaseClient.releaseChangelog({
    version,
    to: sha,
    dryRun: false,
    stageChanges: false,
    gitCommit: false,
    gitTag: false,
    gitPush: false,
  });
  const postGitTask =
    workspaceChangelog?.postGitTask ?? fail("Nx Release did not provide a GitHub release task.");
  await postGitTask(sha);
  console.log(`\nReleased ${tag}`);
};

const main = async () => {
  const { version, tag, sha } = preflight();

  if (dryRun) {
    console.log(`\nDry run complete. Would create GitHub release ${tag} from ${sha}.`);
    return;
  }

  await publish(version, tag, sha);
};

void main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
