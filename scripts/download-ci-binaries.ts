import { mkdirSync } from "node:fs";

import { run } from "./release-command.js";
import { fail, RELEASE_REPO, requireSuccessfulCiRun } from "./release-shared.js";

import { EXPECTED_BINARY_ASSETS } from "./release-checksums.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm download-ci-binaries -- <commit-sha> <output-dir>");
  process.exit(0);
}

if (args.length !== 2) {
  fail("Usage: pnpm download-ci-binaries -- <commit-sha> <output-dir>");
}

const sha = args[0] ?? fail("Usage: pnpm download-ci-binaries -- <commit-sha> <output-dir>");
const outputDir = args[1] ?? fail("Usage: pnpm download-ci-binaries -- <commit-sha> <output-dir>");
const ciRun = requireSuccessfulCiRun(sha);

mkdirSync(outputDir, { recursive: true });

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
