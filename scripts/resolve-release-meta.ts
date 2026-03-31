import { appendFileSync } from "node:fs";

import {
  fail,
  git,
  releaseVersionFromTag,
  requireMatchingReleasePackageVersions,
} from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm exec nx run scripts:resolve-release-meta -- <cli-vX.Y.Z>");
  process.exit(0);
}

if (args.length > 1) {
  fail("Usage: pnpm exec nx run scripts:resolve-release-meta -- <cli-vX.Y.Z>");
}

const tag =
  args[0] ??
  process.env["RELEASE_TAG"] ??
  fail("Usage: pnpm exec nx run scripts:resolve-release-meta -- <cli-vX.Y.Z>");
const version = releaseVersionFromTag(tag);
const releaseVersion = requireMatchingReleasePackageVersions();

if (releaseVersion !== version) {
  fail(`Release package versions (${releaseVersion}) do not match release tag (${version}).`);
}

const sha = git("rev-list", "-n", "1", tag);
const githubOutput = process.env["GITHUB_OUTPUT"];

if (githubOutput !== undefined && githubOutput !== "") {
  appendFileSync(githubOutput, `tag=${tag}\nversion=${version}\nsha=${sha}\n`, "utf8");
}

console.log(`tag=${tag}`);
console.log(`version=${version}`);
console.log(`sha=${sha}`);
