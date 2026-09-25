import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import * as semver from "semver";

import { run } from "./release-command.js";
import {
  produceReleaseCohort,
  stampBootstrapCohortReferences,
  stampBootstrapManifest,
  stampBootstrapSkillDocument,
} from "./release-packages.js";
import {
  contentIntegrity,
  isTransientPublicationError,
  mapWithConcurrency,
  observePublication,
  publishImmutableInDependencyOrder,
  readNpmDistTag,
  readNpmPublication,
} from "./release-publication.js";
import { derivePreviewVersion } from "./release-preview-version.js";
import {
  currentHeadSha,
  fail,
  git,
  AXM_SKILL_DOCUMENT_PATH,
  AXM_SKILL_GENERATED_PATH,
  AXM_SKILL_MANIFEST_PATH,
  RELEASE_PACKAGES,
  RELEASE_PACKAGE_JSON_PATHS,
  requireMatchingReleasePackageVersions,
  requireSuccessfulCiRun,
  runNx,
} from "./release-shared.js";

import { loadNpmPublicationAuth, npmPublicationProcessEnvironment } from "./release-npm-auth.js";
import { readProductionPackages } from "./production-packages.js";

const npmAuthentication = await Effect.runPromise(
  loadNpmPublicationAuth(ConfigProvider.fromEnvRecord(process.env)),
);
const publicationEnvironment = (name: string, packageExists: boolean): NodeJS.ProcessEnv => {
  return npmPublicationProcessEnvironment(name, packageExists, npmAuthentication, process.env);
};

const [sourceSha, sequenceText, sourceRef] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.String, Schema.String, Schema.String]),
  { errors: "all" },
)([process.argv[2], process.argv[3], process.argv[4] ?? ""]);
if (process.argv.length < 4 || process.argv.length > 5)
  fail("Expected <source-sha> <workflow-run-id> [source-ref].");
if (!/^[0-9a-f]{40}$/u.test(sourceSha)) fail("Expected a full lowercase source commit SHA.");
const sequence = Number(sequenceText);
if (!Number.isSafeInteger(sequence) || sequence < 1) fail("Expected a positive workflow run ID.");
if (currentHeadSha() !== sourceSha) fail(`Checked-out source does not match ${sourceSha}.`);
if (
  sourceRef !== "" &&
  (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/u.test(sourceRef) || sourceRef === "main")
) {
  fail("Branch preview requires an explicit non-main branch name.");
}
run("git", ["fetch", "origin", sourceRef === "" ? "main" : sourceRef, "--no-tags"]);
if (git("rev-parse", "FETCH_HEAD") !== sourceSha) {
  fail(
    sourceRef === ""
      ? "Bootstrap prereleases may be published only from the current main commit."
      : "Branch previews may be published only from the exact current branch head.",
  );
}
const ciRun = requireSuccessfulCiRun(sourceSha);

const baseVersion = requireMatchingReleasePackageVersions();
const version = derivePreviewVersion({
  base: baseVersion,
  sequence,
  shortSha: sourceSha.slice(0, 12),
});
const distTag = "preview";
const npmObservationTimeoutMs = 300_000;
const internalManifestPaths = readProductionPackages(process.cwd())
  .filter(({ name }) => !RELEASE_PACKAGES.some((pkg) => pkg.name === name))
  .map(({ directory }) => join(directory, "package.json"));
const snapshots = [
  ...RELEASE_PACKAGE_JSON_PATHS,
  ...internalManifestPaths,
  AXM_SKILL_MANIFEST_PATH,
  AXM_SKILL_DOCUMENT_PATH,
  AXM_SKILL_GENERATED_PATH,
].map((path) => ({
  path,
  original: readFileSync(path, "utf8"),
}));
const temporary = mkdtempSync(join(tmpdir(), "axm-bootstrap-prerelease-"));
const cohort = join(temporary, "cohort");
mkdirSync(cohort);

try {
  try {
    for (const snapshot of snapshots.filter(
      ({ path }) => path !== AXM_SKILL_DOCUMENT_PATH && path !== AXM_SKILL_GENERATED_PATH,
    )) {
      writeFileSync(
        snapshot.path,
        internalManifestPaths.includes(snapshot.path)
          ? stampBootstrapCohortReferences(snapshot.original, version)
          : stampBootstrapManifest(snapshot.original, snapshot.path, version),
        "utf8",
      );
    }
    const skillDocument = snapshots.find(({ path }) => path === AXM_SKILL_DOCUMENT_PATH);
    if (skillDocument === undefined) throw new Error("AXM skill document snapshot is missing.");
    writeFileSync(
      AXM_SKILL_DOCUMENT_PATH,
      stampBootstrapSkillDocument(skillDocument.original, version),
      "utf8",
    );
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

  await Effect.runPromise(
    publishImmutableInDependencyOrder(
      RELEASE_PACKAGES.map((pkg) => {
        const tarball = join(cohort, `${pkg.tarballPrefix}${version}.tgz`);
        return {
          name: `${pkg.name}@${version}`,
          integrity: contentIntegrity(readFileSync(tarball)),
          read: async (signal: AbortSignal) => {
            const metadata = await readNpmPublication(pkg.name, version, fetch, signal);
            publicationEnvironment(pkg.name, metadata.packageExists);
            return metadata.integrity;
          },
          publish: async () => {
            const metadata = await readNpmPublication(pkg.name, version);
            const publicationEnv = publicationEnvironment(pkg.name, metadata.packageExists);
            run(
              "npm",
              [
                "publish",
                tarball,
                "--provenance",
                "--access",
                "public",
                "--tag",
                distTag,
                "--loglevel=warn",
              ],
              publicationEnv,
            );
          },
        };
      }),
      { timeoutMs: npmObservationTimeoutMs },
    ),
  );

  for (const { pkg, current } of tagStates) {
    if (current === version || (await readNpmDistTag(pkg.name, distTag)) === version) continue;
    let submissionFailure: unknown;
    try {
      const publicationEnv = publicationEnvironment(pkg.name, true);
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
        timeoutMs: npmObservationTimeoutMs,
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
