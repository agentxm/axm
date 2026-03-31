import { fail, readPackageVersion, releaseVersionFromTag } from "./release-shared.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: bun scripts/validate-release-tag.ts <release-tag>");
  process.exit(0);
}

if (args.length !== 1) {
  fail("Usage: bun scripts/validate-release-tag.ts <release-tag>");
}

const tag = args[0] ?? fail("Usage: bun scripts/validate-release-tag.ts <release-tag>");
const version = releaseVersionFromTag(tag);
const coreVersion = readPackageVersion("packages/core/package.json");
const cliVersion = readPackageVersion("packages/cli/package.json");

if (coreVersion !== version) {
  fail(
    `packages/core/package.json version (${coreVersion}) does not match release tag (${version})`,
  );
}

if (cliVersion !== version) {
  fail(`packages/cli/package.json version (${cliVersion}) does not match release tag (${version})`);
}

console.log(version);
