import { mkdirSync } from "node:fs";

import { run } from "./release-command.js";
import {
  fail,
  RELEASE_REPO,
  requireCiArtifacts,
  requireSuccessfulCiRun,
  requireSuccessfulCiRunById,
} from "./release-shared.js";

import { EXPECTED_BINARY_ASSETS } from "./release-checksums.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: pnpm download-ci-binaries -- <commit-sha> <binary-output-dir> <npm-output-dir> [ci-run-id]",
  );
  process.exit(0);
}

if (args.length < 3 || args.length > 4) {
  fail(
    "Usage: pnpm download-ci-binaries -- <commit-sha> <binary-output-dir> <npm-output-dir> [ci-run-id]",
  );
}

const usage =
  "Usage: pnpm download-ci-binaries -- <commit-sha> <binary-output-dir> <npm-output-dir> [ci-run-id]";
const sha = args[0] ?? fail(usage);
const outputDir = args[1] ?? fail(usage);
const npmOutputDir = args[2] ?? fail(usage);
const runId = args[3];
const parsedRunId = runId === undefined ? undefined : Number(runId);
if (parsedRunId !== undefined && !Number.isSafeInteger(parsedRunId))
  fail("Invalid exact CI run ID.");
const ciRun =
  parsedRunId === undefined
    ? requireSuccessfulCiRun(sha)
    : requireSuccessfulCiRunById(parsedRunId, sha, "push");
requireCiArtifacts(ciRun, [
  ...EXPECTED_BINARY_ASSETS.map((asset) => `axm-binary-${asset}-${sha}`),
  `axm-npm-cohort-${sha}`,
]);

mkdirSync(outputDir, { recursive: true });
mkdirSync(npmOutputDir, { recursive: true });

for (const asset of EXPECTED_BINARY_ASSETS) {
  run("gh", [
    "run",
    "download",
    String(ciRun.databaseId),
    "--repo",
    RELEASE_REPO,
    "--name",
    `axm-binary-${asset}-${sha}`,
    "--dir",
    outputDir,
  ]);
}

run("gh", [
  "run",
  "download",
  String(ciRun.databaseId),
  "--repo",
  RELEASE_REPO,
  "--name",
  `axm-npm-cohort-${sha}`,
  "--dir",
  npmOutputDir,
]);
