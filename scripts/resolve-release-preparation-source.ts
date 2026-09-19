/** Resolve an exact main revision and cohort state for Actions preparation. */

import { appendFileSync } from "node:fs";
import * as Effect from "effect/Effect";

import { validateReleasePreparationSource } from "./release-preflight.js";
import { requireInitializedNpmPackages } from "./release-publication.js";
import {
  currentHeadSha,
  fail,
  fetchOriginMain,
  git,
  RELEASE_PACKAGES,
  requireCleanWorkingTree,
  requireMatchingReleasePackageVersions,
} from "./release-shared.js";

const sourceSha =
  process.env["AXM_RELEASE_SOURCE_SHA"] ??
  fail("AXM_RELEASE_SOURCE_SHA must name the exact main commit to prepare.");
const outputPath =
  process.env["GITHUB_OUTPUT"] ??
  fail("GITHUB_OUTPUT is required when resolving a release preparation source.");

requireCleanWorkingTree();
fetchOriginMain();

const version = requireMatchingReleasePackageVersions();
const headSha = currentHeadSha();
const originMainSha = git("rev-parse", "origin/main");
validateReleasePreparationSource(sourceSha, headSha, originMainSha);

await Effect.runPromise(requireInitializedNpmPackages(RELEASE_PACKAGES.map((pkg) => pkg.name)));

console.log(`  Source commit: ${sourceSha}`);
console.log(`  Current version: ${version}`);

appendFileSync(outputPath, `source_sha=${sourceSha}\ncurrent_version=${version}\n`, "utf8");
