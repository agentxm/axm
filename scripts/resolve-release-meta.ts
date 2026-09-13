import { appendFileSync } from "node:fs";

import {
  fail,
  git,
  releaseVersionFromTag,
  requireMatchingReleasePackageVersions,
  requireMatchingReleasePackageVersionsAtRef,
} from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm resolve-release-meta -- <cli-vX.Y.Z> [expected-commit-sha]");
  process.exit(0);
}

if (args.length > 2) {
  fail("Usage: pnpm resolve-release-meta -- <cli-vX.Y.Z> [expected-commit-sha]");
}

const tag =
  args[0] ??
  process.env["RELEASE_TAG"] ??
  fail("Usage: pnpm resolve-release-meta -- <cli-vX.Y.Z> [expected-commit-sha]");
const version = releaseVersionFromTag(tag);

const expectedSha = args[1] ?? process.env["RELEASE_SHA"];
if (expectedSha !== undefined && !/^[0-9a-f]{40}$/u.test(expectedSha)) {
  fail("Expected a full lowercase release commit SHA.");
}
const releaseVersion =
  expectedSha === undefined
    ? requireMatchingReleasePackageVersions()
    : requireMatchingReleasePackageVersionsAtRef(expectedSha);

if (releaseVersion !== version) {
  fail(`Release package versions (${releaseVersion}) do not match release tag (${version}).`);
}

const sha = expectedSha ?? git("rev-list", "-n", "1", tag);
const githubOutput = process.env["GITHUB_OUTPUT"];

if (githubOutput !== undefined && githubOutput !== "") {
  appendFileSync(githubOutput, `tag=${tag}\nversion=${version}\nsha=${sha}\n`, "utf8");
}

console.log(`tag=${tag}`);
console.log(`version=${version}`);
console.log(`sha=${sha}`);
