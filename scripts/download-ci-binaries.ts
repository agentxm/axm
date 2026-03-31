import { mkdirSync } from "node:fs";

import { run } from "./release-command.js";
import { fail, RELEASE_REPO, requireSuccessfulCiRun } from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm exec nx run scripts:download-ci-binaries -- <commit-sha> <output-dir>");
  process.exit(0);
}

if (args.length !== 2) {
  fail("Usage: pnpm exec nx run scripts:download-ci-binaries -- <commit-sha> <output-dir>");
}

const sha =
  args[0] ??
  fail("Usage: pnpm exec nx run scripts:download-ci-binaries -- <commit-sha> <output-dir>");
const outputDir =
  args[1] ??
  fail("Usage: pnpm exec nx run scripts:download-ci-binaries -- <commit-sha> <output-dir>");
const artifactName = `axm-binaries-${sha}`;
const ciRun = requireSuccessfulCiRun(sha);

mkdirSync(outputDir, { recursive: true });

run("gh", [
  "run",
  "download",
  String(ciRun.databaseId),
  "--repo",
  RELEASE_REPO,
  "--name",
  artifactName,
  "--dir",
  outputDir,
]);
