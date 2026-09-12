import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as Schema from "effect/Schema";
import * as semver from "semver";

import { run } from "./release-command.js";
import { produceReleaseCohort } from "./release-packages.js";
import {
  contentIntegrity,
  isTransientPublicationError,
  mapWithConcurrency,
  observePublication,
  publishImmutableCohort,
  readNpmDistTag,
  readNpmPublication,
} from "./release-publication.js";
import { derivePreviewVersion } from "./release-preview-version.js";
import {
  currentHeadSha,
  fail,
  git,
  RELEASE_PACKAGES,
  RELEASE_PACKAGE_JSON_PATHS,
  requireMatchingReleasePackageVersions,
  requireSuccessfulCiRun,
  runNx,
} from "./release-shared.js";

const [sourceSha, sequenceText] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.String, Schema.String]),
  { errors: "all" },
)(process.argv.slice(2, 4));
if (process.argv.length !== 4) fail("Expected <source-sha> <workflow-run-id>.");
if (!/^[0-9a-f]{40}$/u.test(sourceSha)) fail("Expected a full lowercase source commit SHA.");
const sequence = Number(sequenceText);
if (!Number.isSafeInteger(sequence) || sequence < 1) fail("Expected a positive workflow run ID.");
if (currentHeadSha() !== sourceSha) fail(`Checked-out source does not match ${sourceSha}.`);
run("git", ["fetch", "origin", "main", "--no-tags"]);
if (git("rev-parse", "origin/main") !== sourceSha) {
  fail("Bootstrap prereleases may be published only from the current main commit.");
}
const ciRun = requireSuccessfulCiRun(sourceSha);

const baseVersion = requireMatchingReleasePackageVersions();
const version = derivePreviewVersion({
  base: baseVersion,
  sequence,
  shortSha: sourceSha.slice(0, 12),
});
const distTag = "preview";
const snapshots = RELEASE_PACKAGE_JSON_PATHS.map((path) => ({
  path,
  original: readFileSync(path, "utf8"),
}));
const stampVersion = (original: string, path: string): string => {
  const updated = original.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
  if (updated === original) fail(`Could not stamp version field in ${path}.`);
  return updated;
};
const temporary = mkdtempSync(join(tmpdir(), "axm-bootstrap-prerelease-"));
const cohort = join(temporary, "cohort");
mkdirSync(cohort);

try {
  try {
    for (const snapshot of snapshots) {
      writeFileSync(snapshot.path, stampVersion(snapshot.original, snapshot.path), "utf8");
    }
    runNx("run-many", "-t", "build", "--projects", "tag:release:cli");
    await produceReleaseCohort(version, sourceSha, cohort);
  } finally {
    for (const snapshot of snapshots) writeFileSync(snapshot.path, snapshot.original, "utf8");
  }

  const tagStates = await mapWithConcurrency(RELEASE_PACKAGES, 6, async (pkg) => ({
    pkg,
    current: await readNpmDistTag(pkg.name, distTag),
  }));
  for (const { pkg, current } of tagStates) {
    if (current !== null && semver.valid(current) === null) {
      throw new Error(`npm ${distTag} returned an invalid version for ${pkg.name}.`);
    }
    if (current !== null && semver.gt(current, version)) {
      throw new Error(`Bootstrap prerelease ${version} is superseded by ${pkg.name}@${current}.`);
    }
  }

  const publicationEnv = { ...process.env };
  delete publicationEnv["NODE_AUTH_TOKEN"];
  delete publicationEnv["NPM_CONFIG_USERCONFIG"];
  await publishImmutableCohort(
    RELEASE_PACKAGES.map((pkg) => {
      const tarball = join(cohort, `${pkg.tarballPrefix}${version}.tgz`);
      return {
        name: `${pkg.name}@${version}`,
        integrity: contentIntegrity(readFileSync(tarball)),
        read: async (signal: AbortSignal) =>
          (await readNpmPublication(pkg.name, version, fetch, signal)).integrity,
        publish: async () => {
          run(
            "npm",
            ["publish", tarball, "--provenance", "--access", "public", "--tag", distTag],
            publicationEnv,
          );
        },
      };
    }),
    { concurrency: 6, timeoutMs: 120_000 },
  );

  for (const { pkg, current } of tagStates) {
    if (current === version) continue;
    let submissionFailure: unknown;
    try {
      run("npm", ["dist-tag", "add", `${pkg.name}@${version}`, distTag], publicationEnv);
    } catch (error) {
      submissionFailure = error;
    }
    try {
      await observePublication({
        name: `npm ${distTag} ${pkg.name}@${version}`,
        read: (signal) => readNpmDistTag(pkg.name, distTag, fetch, signal),
        matches: (observed) => observed === version,
        conflicts: (observed) =>
          observed !== null && semver.valid(observed) !== null && semver.gt(observed, version),
        retryError: isTransientPublicationError,
        timeoutMs: 120_000,
      });
    } catch (readbackFailure) {
      if (submissionFailure !== undefined) {
        throw new AggregateError(
          [submissionFailure, readbackFailure],
          `npm ${distTag} submission and bounded readback failed for ${pkg.name}.`,
          { cause: readbackFailure },
        );
      }
      throw readbackFailure;
    }
  }

  const githubOutput = process.env["GITHUB_OUTPUT"];
  if (githubOutput !== undefined && githubOutput !== "") {
    writeFileSync(githubOutput, `version=${version}\nci_run_id=${ciRun.databaseId}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  }
  console.log(`Published bootstrap prerelease ${version} under npm ${distTag}.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
