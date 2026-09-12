/** Resolve an exact main revision and released skill for Actions preparation. */

import { appendFileSync } from "node:fs";

import { selectReleasedSkillTag, validateReleasePreparationSource } from "./release-preflight.js";
import {
  currentHeadSha,
  fail,
  fetchOriginMain,
  git,
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

const reachableTags = git("tag", "--merged", "HEAD", "--list", "cli-v*").split("\n");
const releasedSkillTag = selectReleasedSkillTag(version, reachableTags);

console.log(`  Source commit: ${sourceSha}`);
console.log(`  Current version: ${version}`);
console.log(`  Released skill tag: ${releasedSkillTag}`);

appendFileSync(
  outputPath,
  `source_sha=${sourceSha}\ncurrent_version=${version}\nreleased_skill_tag=${releasedSkillTag}\n`,
  "utf8",
);
