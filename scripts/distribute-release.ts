import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import {
  inspectLatestRelease,
  publishReleaseDistribution,
  ReleaseStorageError,
} from "./release-distribution.js";
import { makeReleaseStorage } from "./release-distribution-s3.js";
import { validateReleaseCohort } from "./release-packages.js";
import { requireFullSha, requireStableVersion } from "./release-identity.js";
import { RELEASE_PACKAGES, RELEASE_REPO } from "./release-shared.js";
import { captureReleaseCommand, releaseValidation, runReleaseCommand } from "./release-process.js";
import { foreignGitEnvironment, requireForeignGitRoot } from "./release-foreign-git.js";
import {
  CHECKSUM_MANIFEST,
  EXPECTED_RELEASE_ASSETS,
  parseChecksumManifest,
  validateReleaseAssets,
} from "./release-checksums.js";
import {
  contentIntegrity,
  distributeRelease,
  guardPublicationVersion,
  isTransientPublicationError,
  observePublication,
  publishImmutableCohort,
  publishImmutableInDependencyOrder,
  readNpmPublication,
  verifyNpmDownload,
  npmPropagationTimeoutMs,
  releaseCohortTarballPath,
  releaseBoundaryError,
  reconcileNpmStableTag,
  PublicationUnconfirmed,
  type PublicationBoundary,
} from "./release-publication.js";
import { formulaVersion, prepareFormula } from "./release-formula.js";
import { loadHomebrewPublicationToken, readHomebrewFormula } from "./release-homebrew.js";
import { decodeGitHubReleaseAssetView } from "./release-github-release-api.js";
import { makeReleaseAssetReader } from "./release-asset-readback.js";
import { loadNpmPublicationAuth, npmPublicationProcessEnvironment } from "./release-npm-auth.js";

const program = Effect.scoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const [version, tag, releaseCommit] = yield* Schema.decodeUnknownEffect(
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    )(process.argv.slice(2, 5));
    yield* releaseValidation("Validate release identity", () => {
      if (tag !== `cli-v${version}`)
        throw new Error("Expected <version> <cli-vVERSION> <release-commit>.");
      requireFullSha(releaseCommit, "Release commit");
      requireStableVersion(version);
    });
    const assets = path.resolve("release-assets");
    const npmCohort = path.resolve("release-npm");
    const provider = ConfigProvider.fromEnvRecord(process.env);
    const npmAuthentication = yield* loadNpmPublicationAuth(provider);
    const homebrewToken = yield* loadHomebrewPublicationToken(provider);
    const publicationEnvironment = (name: string, exists: boolean) =>
      npmPublicationProcessEnvironment(name, exists, npmAuthentication, process.env);
    yield* releaseValidation("Validate release assets", () => validateReleaseAssets(assets));
    yield* validateReleaseCohort(npmCohort, version, releaseCommit);
    const checksumText = yield* fs.readFileString(path.join(assets, CHECKSUM_MANIFEST));
    const checksums = yield* releaseValidation("Decode release checksums", () =>
      parseChecksumManifest(checksumText),
    );
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "axm-publication-" });
    const output = (key: string, value: string) => {
      const file = process.env["GITHUB_OUTPUT"];
      return file === undefined
        ? Effect.void
        : fs.writeFileString(file, `${key}=${value}\n`, { flag: "a" });
    };
    const storage = yield* makeReleaseStorage(provider).pipe(
      Effect.tapError(() => output("outcome", "distribution-failed")),
    );
    const guard = (observed: string | null, owner: string) =>
      Effect.try({
        try: () => guardPublicationVersion(version, observed, owner),
        catch: releaseBoundaryError,
      });
    const readFormula = readHomebrewFormula(homebrewToken);
    const latestGuard = (name: string) =>
      Effect.gen(function* () {
        const metadata = yield* readNpmPublication(name, version);
        yield* publicationEnvironment(name, metadata.packageExists);
        yield* guard(metadata.latest, name);
        return metadata;
      });
    // The three independent owners and the existing six-wide metadata window
    // preserve the release pipeline's provider request budget.
    const preflight = Effect.all(
      [
        inspectLatestRelease(storage, version),
        Effect.forEach(RELEASE_PACKAGES, (pkg) => latestGuard(pkg.name), { concurrency: 6 }),
        readFormula.pipe(
          Effect.flatMap((formula) =>
            releaseValidation("Read Homebrew version", () => formulaVersion(formula)),
          ),
          Effect.flatMap((observed) => guard(observed, "Homebrew")),
        ),
      ],
      { concurrency: 3, discard: true },
    );

    const publish = process.argv.includes("--preflight")
      ? preflight.pipe(
          Effect.andThen(output("outcome", "ready")),
          Effect.tap(() => Console.log(`Release distribution preflight: ${version} is ready.`)),
          Effect.catchTag("SupersededRelease", (error) =>
            output("outcome", "superseded").pipe(Effect.tap(() => Console.log(error.message))),
          ),
        )
      : Effect.gen(function* () {
          const boundaries = [
            {
              name: "artifacts",
              publish: () =>
                Effect.gen(function* () {
                  const readAsset = yield* makeReleaseAssetReader({
                    releaseCommit,
                    viewRelease: captureReleaseCommand("gh", [
                      "release",
                      "view",
                      tag,
                      "--repo",
                      RELEASE_REPO,
                      "--json",
                      "targetCommitish,assets",
                    ]).pipe(Effect.flatMap(decodeGitHubReleaseAssetView)),
                    downloadAsset: (name) =>
                      Effect.scoped(
                        Effect.gen(function* () {
                          const directory = yield* fs.makeTempDirectoryScoped({
                            directory: temporary,
                            prefix: "asset-",
                          });
                          yield* runReleaseCommand("gh", [
                            "release",
                            "download",
                            tag,
                            "--repo",
                            RELEASE_REPO,
                            "--pattern",
                            name,
                            "--dir",
                            directory,
                          ]);
                          return yield* fs.readFile(path.join(directory, name));
                        }),
                      ),
                  });
                  const publications = yield* Effect.forEach(EXPECTED_RELEASE_ASSETS, (name) =>
                    Effect.gen(function* () {
                      const bytes = yield* fs.readFile(path.join(assets, name));
                      return {
                        name,
                        integrity: contentIntegrity(bytes),
                        read: readAsset({ name, size: bytes.byteLength }),
                        publish: runReleaseCommand("gh", [
                          "release",
                          "upload",
                          tag,
                          path.join(assets, name),
                          "--repo",
                          RELEASE_REPO,
                        ]),
                      };
                    }),
                  );
                  yield* publishImmutableCohort(publications, { concurrency: 3 });
                }),
            },
            {
              name: "distribution",
              publish: () =>
                publishReleaseDistribution(storage, {
                  version,
                  commit: releaseCommit,
                  loadAsset: (name) =>
                    fs.readFile(path.join(assets, name)).pipe(
                      Effect.mapError(
                        () =>
                          new ReleaseStorageError({
                            operation: "read local asset",
                            detail: `Cannot read ${name}`,
                          }),
                      ),
                    ),
                }),
            },
            {
              name: "npm",
              publish: () =>
                Effect.gen(function* () {
                  const publications = yield* Effect.forEach(RELEASE_PACKAGES, (pkg) =>
                    Effect.gen(function* () {
                      const tarball = yield* releaseCohortTarballPath(
                        npmCohort,
                        pkg.tarballPrefix,
                        version,
                      );
                      const bytes = yield* fs.readFile(tarball);
                      return {
                        name: `${pkg.name}@${version}`,
                        packageName: pkg.name,
                        integrity: contentIntegrity(bytes),
                        read: latestGuard(pkg.name).pipe(
                          Effect.map((metadata) => metadata.integrity),
                        ),
                        publish: Effect.gen(function* () {
                          const metadata = yield* latestGuard(pkg.name);
                          const env = yield* publicationEnvironment(
                            pkg.name,
                            metadata.packageExists,
                          );
                          yield* runReleaseCommand(
                            "npm",
                            [
                              "publish",
                              tarball,
                              "--provenance",
                              "--access",
                              "public",
                              "--tag",
                              "latest",
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
                    preflightTimeoutMs: 360_000,
                  });
                  yield* Effect.forEach(publications, (publication) =>
                    verifyNpmDownload({
                      name: publication.packageName,
                      version,
                      integrity: publication.integrity,
                    }),
                  );
                  yield* Effect.forEach(
                    RELEASE_PACKAGES,
                    (pkg) =>
                      reconcileNpmStableTag({
                        name: pkg.name,
                        version,
                        read: latestGuard(pkg.name).pipe(Effect.map((metadata) => metadata.latest)),
                        promote: Effect.gen(function* () {
                          yield* latestGuard(pkg.name);
                          const env = yield* publicationEnvironment(pkg.name, true);
                          yield* runReleaseCommand(
                            "npm",
                            ["dist-tag", "add", `${pkg.name}@${version}`, "latest"],
                            { env },
                          );
                        }),
                      }),
                    { concurrency: 6 },
                  );
                }),
            },
            {
              name: "tap",
              publish: () =>
                Effect.gen(function* () {
                  const prepare = readFormula.pipe(
                    Effect.flatMap((formula) =>
                      Effect.try({
                        try: () => prepareFormula(formula, version, checksums),
                        catch: releaseBoundaryError,
                      }),
                    ),
                  );
                  if (!(yield* prepare).changed) return;
                  const tap = path.join(temporary, "tap");
                  yield* runReleaseCommand(
                    "git",
                    ["clone", "--depth", "1", "https://github.com/agentxm/homebrew-tap.git", tap],
                    { env: foreignGitEnvironment() },
                  );
                  yield* requireForeignGitRoot(tap, tap);
                  const env = {
                    ...foreignGitEnvironment(),
                    HOMEBREW_TAP_DIR: tap,
                    RELEASE_ASSET_DIR: assets,
                    GIT_CONFIG_COUNT: "1",
                    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
                    GIT_CONFIG_VALUE_0: Redacted.make(
                      `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${Redacted.value(homebrewToken)}`).toString("base64")}`,
                    ),
                  };
                  const submission = yield* Effect.result(
                    runReleaseCommand(
                      "pnpm",
                      ["exec", "nx", "run", "axm:update-homebrew-formula", "--", version],
                      { cwd: process.cwd(), env },
                    ),
                  );
                  yield* observePublication({
                    name: `Homebrew formula ${version}`,
                    read: prepare,
                    matches: (observed) => !observed.changed,
                    retryError: isTransientPublicationError,
                  }).pipe(
                    Effect.mapError((cause) =>
                      submission._tag === "Failure"
                        ? new PublicationUnconfirmed({
                            publication: `Homebrew formula ${version}`,
                            submissionFailure: submission.failure,
                            cause,
                          })
                        : cause,
                    ),
                  );
                }),
            },
          ] satisfies ReadonlyArray<PublicationBoundary<unknown, unknown>>;
          type Publication = ReturnType<(typeof boundaries)[number]["publish"]>;
          const publicationBoundaries: ReadonlyArray<
            PublicationBoundary<Effect.Error<Publication>, Effect.Services<Publication>>
          > = boundaries;
          const outcome = yield* distributeRelease(preflight, publicationBoundaries, (states) =>
            output("publication", JSON.stringify(states)),
          );
          yield* output("outcome", outcome);
          yield* Console.log(`Release distribution: ${outcome}.`);
        });
    yield* publish.pipe(
      Effect.onExit((exit) =>
        Exit.isFailure(exit) ? output("outcome", "distribution-failed") : Effect.void,
      ),
    );
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
