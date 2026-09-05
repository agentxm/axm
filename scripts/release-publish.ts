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

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RELEASE_REPO,
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
import { releaseNotesAtRef } from "./release-notes.js";
import { run } from "./release-command.js";

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

const withNotesFile = <A>(releaseNotes: string, operation: (path: string) => A): A => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "axm-release-notes-"));
  const notesPath = join(tempDirectory, "notes.md");

  writeFileSync(notesPath, releaseNotes, "utf8");

  try {
    return operation(notesPath);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
};

const publish = async (version: string, tag: string, sha: string) => {
  console.log("\n==> Create GitHub Release");
  const releaseNotes = releaseNotesAtRef(sha, version);

  withNotesFile(releaseNotes, (notesPath) => {
    run("gh", [
      "release",
      "create",
      tag,
      "--repo",
      RELEASE_REPO,
      "--target",
      sha,
      "--title",
      tag,
      "--notes-file",
      notesPath,
    ]);
  });

  console.log(
    `\nCreated GitHub Release ${tag}; the publication and verification workflow must complete before stable promotion`,
  );
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
