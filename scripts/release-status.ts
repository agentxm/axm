/**
 * Show the latest prepared release commit on origin/main and whether it is ready to publish.
 *
 * Usage:
 *   pnpm release:status
 */

import {
  fetchOriginMain,
  latestCiRunForCommit,
  latestPreparedReleaseCommitOnOriginMain,
  lookupGitHubReleaseByTag,
  remoteTagExists,
} from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm release:status");
  process.exit(0);
}

if (args.length > 0) {
  console.error("Usage: pnpm release:status");
  process.exit(1);
}

const summarizeCi = (ciRun: ReturnType<typeof latestCiRunForCommit>): string => {
  if (ciRun === undefined) {
    return "not found";
  }

  if (ciRun.status !== "completed" || ciRun.conclusion === null) {
    return `${ciRun.status} ${ciRun.url}`;
  }

  return `${ciRun.conclusion} ${ciRun.url}`;
};

const summarizeGitHubRelease = (
  releaseLookup: ReturnType<typeof lookupGitHubReleaseByTag>,
): string => {
  if (releaseLookup.kind === "present") {
    return `present ${releaseLookup.release.url}`;
  }

  if (releaseLookup.kind === "absent") {
    return "missing";
  }

  return `lookup failed (${releaseLookup.error})`;
};

const summarizeOverallStatus = (
  ciRun: ReturnType<typeof latestCiRunForCommit>,
  tagExists: boolean,
  releaseLookup: ReturnType<typeof lookupGitHubReleaseByTag>,
): string => {
  if (releaseLookup.kind === "present") {
    return "published";
  }

  if (releaseLookup.kind === "unknown") {
    return "release lookup unavailable";
  }

  if (tagExists) {
    return "tag exists, release missing";
  }

  if (ciRun === undefined) {
    return "prepared, waiting for CI run";
  }

  if (ciRun.status !== "completed" || ciRun.conclusion === null) {
    return "prepared, waiting for CI";
  }

  if (ciRun.conclusion !== "success") {
    return `blocked by CI (${ciRun.conclusion})`;
  }

  return "ready to publish";
};

const main = () => {
  console.log("==> Release status");
  fetchOriginMain();

  const preparedRelease = latestPreparedReleaseCommitOnOriginMain();

  if (preparedRelease === undefined) {
    console.log("  Latest prepared release: none found on origin/main");
    return;
  }

  const ciRun = latestCiRunForCommit(preparedRelease.sha);
  const tagExists = remoteTagExists(preparedRelease.tag);
  const releaseLookup = lookupGitHubReleaseByTag(preparedRelease.tag);

  console.log(`  Latest prepared release: ${preparedRelease.tag}`);
  console.log(`  Commit: ${preparedRelease.sha}`);
  console.log(`  CI: ${summarizeCi(ciRun)}`);
  console.log(`  Tag on origin: ${tagExists ? "present" : "missing"}`);
  console.log(`  GitHub release: ${summarizeGitHubRelease(releaseLookup)}`);
  console.log(`  Status: ${summarizeOverallStatus(ciRun, tagExists, releaseLookup)}`);
};

main();
