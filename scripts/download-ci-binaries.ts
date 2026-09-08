import { mkdirSync } from "node:fs";

import { run } from "./release-command.js";
import { fail, RELEASE_REPO, requireSuccessfulCiRun } from "./release-shared.js";

import { EXPECTED_BINARY_ASSETS } from "./release-checksums.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: pnpm download-ci-binaries -- <commit-sha> <binary-output-dir> <npm-output-dir>",
  );
  process.exit(0);
}

if (args.length !== 3) {
  fail("Usage: pnpm download-ci-binaries -- <commit-sha> <binary-output-dir> <npm-output-dir>");
}

const usage =
  "Usage: pnpm download-ci-binaries -- <commit-sha> <binary-output-dir> <npm-output-dir>";
const sha = args[0] ?? fail(usage);
const outputDir = args[1] ?? fail(usage);
const npmOutputDir = args[2] ?? fail(usage);
const ciRun = requireSuccessfulCiRun(sha);

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
