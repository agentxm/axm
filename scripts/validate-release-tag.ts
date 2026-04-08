import {
  fail,
  releaseVersionFromTag,
  requireMatchingReleasePackageVersions,
} from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm validate-release-tag -- <release-tag>");
  process.exit(0);
}

if (args.length !== 1) {
  fail("Usage: pnpm validate-release-tag -- <release-tag>");
}

const tag = args[0] ?? fail("Usage: pnpm validate-release-tag -- <release-tag>");
const version = releaseVersionFromTag(tag);
const releaseVersion = requireMatchingReleasePackageVersions();

if (releaseVersion !== version) {
  fail(`Release package versions (${releaseVersion}) do not match release tag (${version}).`);
}

console.log(version);
