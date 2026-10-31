import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as semver from "semver";
import { requireFullSha } from "./release-identity.js";
import {
  produceReleaseCohort,
  stampBootstrapCohortReferences,
  stampBootstrapManifest,
  stampBootstrapSkillDocument,
} from "./release-packages.js";
import {
  contentIntegrity,
  isTransientPublicationError,
  npmPropagationTimeoutMs,
  observePublication,
  PublicationUnconfirmed,
  publishImmutableInDependencyOrder,
  readNpmDistTag,
  readNpmPublication,
} from "./release-publication.js";
import { derivePreviewVersion } from "./release-preview-version.js";
import {
  AXM_SKILL_DOCUMENT_PATH,
  AXM_SKILL_GENERATED_PATH,
  AXM_SKILL_MANIFEST_PATH,
  RELEASE_PACKAGES,
  RELEASE_PACKAGE_JSON_PATHS,
  RELEASE_PROCESS_ENV,
} from "./release-shared.js";
import { loadNpmPublicationAuth, npmPublicationProcessEnvironment } from "./release-npm-auth.js";
import { readProductionPackages } from "./production-packages.js";
import { captureReleaseCommand, releaseValidation, runReleaseCommand } from "./release-process.js";
import { readReleaseVersion, successfulReleaseCiRun } from "./release-runtime.js";
import { withReleaseFileSnapshots } from "./release-package-staging.js";

const program = Effect.scoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const npmAuthentication = yield* loadNpmPublicationAuth(
      ConfigProvider.fromEnvRecord(process.env),
    );
    const publicationEnvironment = (name: string, exists: boolean) =>
      npmPublicationProcessEnvironment(name, exists, npmAuthentication, process.env);
    const [sourceSha, sequenceText, sourceRef] = yield* Schema.decodeUnknownEffect(
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    )([process.argv[2], process.argv[3], process.argv[4] ?? ""]);
    const sequence = yield* releaseValidation("Validate preview identity", () => {
      if (process.argv.length < 4 || process.argv.length > 5)
        throw new Error("Expected <source-sha> <workflow-run-id> [source-ref].");
      requireFullSha(sourceSha, "Source commit");
      const sequence = Number(sequenceText);
      if (!Number.isSafeInteger(sequence) || sequence < 1)
        throw new Error("Expected a positive workflow run ID.");
      if (
        sourceRef !== "" &&
        (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/u.test(sourceRef) || sourceRef === "main")
      )
        throw new Error("Branch preview requires an explicit non-main branch name.");
      return sequence;
    });
    const head = yield* captureReleaseCommand("git", ["rev-parse", "HEAD"]);
    yield* releaseValidation("Validate checked-out source", () => {
      if (head !== sourceSha) throw new Error(`Checked-out source does not match ${sourceSha}.`);
    });
    yield* runReleaseCommand("git", [
      "fetch",
      "origin",
      sourceRef === "" ? "main" : sourceRef,
      "--no-tags",
    ]);
    const fetchedHead = yield* captureReleaseCommand("git", ["rev-parse", "FETCH_HEAD"]);
    yield* releaseValidation("Validate current branch head", () => {
      if (fetchedHead !== sourceSha)
        throw new Error(
          sourceRef === ""
            ? "Bootstrap prereleases may be published only from the current main commit."
            : "Branch previews may be published only from the exact current branch head.",
        );
    });
    const ciRun = yield* successfulReleaseCiRun(sourceSha);
    const base = yield* readReleaseVersion();
    const version = yield* releaseValidation("Derive preview version", () =>
      derivePreviewVersion({ base, sequence, shortSha: sourceSha.slice(0, 12) }),
    );
    const distTag = "preview";
    const internalManifestPaths = yield* releaseValidation("Discover preview manifests", () =>
      readProductionPackages(process.cwd())
        .filter(({ name }) => !RELEASE_PACKAGES.some((pkg) => pkg.name === name))
        .map(({ directory }) => path.join(directory, "package.json")),
    );
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "axm-bootstrap-prerelease-" });
    const cohort = path.join(temporary, "cohort");
    yield* fs.makeDirectory(cohort);
    yield* withReleaseFileSnapshots(
      [
        ...RELEASE_PACKAGE_JSON_PATHS,
        ...internalManifestPaths,
        AXM_SKILL_MANIFEST_PATH,
        AXM_SKILL_DOCUMENT_PATH,
        AXM_SKILL_GENERATED_PATH,
      ],
      (snapshots) =>
        Effect.gen(function* () {
          for (const snapshot of snapshots) {
            if (snapshot.path === AXM_SKILL_GENERATED_PATH) continue;
            const stamped = yield* releaseValidation("Stamp preview source", () =>
              snapshot.path === AXM_SKILL_DOCUMENT_PATH
                ? stampBootstrapSkillDocument(snapshot.original, version)
                : internalManifestPaths.includes(snapshot.path)
                  ? stampBootstrapCohortReferences(snapshot.original, version)
                  : stampBootstrapManifest(snapshot.original, snapshot.path, version),
            );
            yield* fs.writeFileString(snapshot.path, stamped);
          }
          yield* runReleaseCommand(
            "pnpm",
            [
              "exec",
              "nx",
              "run-many",
              "-t",
              "build",
              "--projects",
              "tag:release:cli",
              "--outputStyle=static",
            ],
            { env: RELEASE_PROCESS_ENV },
          );
          yield* produceReleaseCohort(version, sourceSha, cohort);
        }),
    );

    const tagStates = yield* Effect.forEach(
      RELEASE_PACKAGES,
      (pkg) => readNpmDistTag(pkg.name, distTag).pipe(Effect.map((current) => ({ pkg, current }))),
      { concurrency: 6 },
    );
    yield* releaseValidation("Validate preview dist-tags", () => {
      for (const { pkg, current } of tagStates) {
        if (current !== null && semver.valid(current) === null)
          throw new Error(`npm ${distTag} returned an invalid version for ${pkg.name}.`);
        if (current !== null && semver.gt(current, version))
          throw new Error(
            `Bootstrap prerelease ${version} is superseded by ${pkg.name}@${current}.`,
          );
      }
    });
    const publications = yield* Effect.forEach(RELEASE_PACKAGES, (pkg) =>
      Effect.gen(function* () {
        const tarball = path.join(cohort, `${pkg.tarballPrefix}${version}.tgz`);
        const bytes = yield* fs.readFile(tarball);
        return {
          name: `${pkg.name}@${version}`,
          integrity: contentIntegrity(bytes),
          read: Effect.gen(function* () {
            const metadata = yield* readNpmPublication(pkg.name, version);
            yield* publicationEnvironment(pkg.name, metadata.packageExists);
            return metadata.integrity;
          }),
          publish: Effect.gen(function* () {
            const metadata = yield* readNpmPublication(pkg.name, version);
            const env = yield* publicationEnvironment(pkg.name, metadata.packageExists);
            yield* runReleaseCommand(
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
              { env },
            );
          }),
        };
      }),
    );
    yield* publishImmutableInDependencyOrder(publications, {
      timeoutMs: npmPropagationTimeoutMs,
      preflightTimeoutMs: 300_000,
    });
    for (const { pkg, current } of tagStates) {
      if (current === version || (yield* readNpmDistTag(pkg.name, distTag)) === version) continue;
      const env = yield* publicationEnvironment(pkg.name, true);
      const submission = yield* Effect.result(
        runReleaseCommand("npm", ["dist-tag", "add", `${pkg.name}@${version}`, distTag], { env }),
      );
      yield* observePublication({
        name: `npm ${distTag} ${pkg.name}@${version}`,
        read: readNpmDistTag(pkg.name, distTag),
        matches: (observed) => observed === version,
        conflicts: (observed) =>
          observed !== null && semver.valid(observed) !== null && semver.gt(observed, version),
        retryError: isTransientPublicationError,
        timeoutMs: npmPropagationTimeoutMs,
      }).pipe(
        Effect.mapError((cause) =>
          submission._tag === "Failure"
            ? new PublicationUnconfirmed({
                publication: `npm ${distTag} ${pkg.name}`,
                submissionFailure: submission.failure,
                cause,
              })
            : cause,
        ),
      );
    }
    const output = process.env["GITHUB_OUTPUT"];
    if (output !== undefined && output !== "")
      yield* fs.writeFileString(output, `version=${version}\nci_run_id=${ciRun.databaseId}\n`, {
        flag: "a",
      });
    yield* Console.log(`Published bootstrap prerelease ${version} under npm ${distTag}.`);
  }),
);

NodeRuntime.runMain(
  program.pipe(
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide([NodeServices.layer, FetchHttpClient.layer]),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
  ),
  { disableErrorReporting: true },
);
