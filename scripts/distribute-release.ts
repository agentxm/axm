import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import { validateReleaseCohort } from "./release-packages.js";
import { requireFullSha, requireStableVersion } from "./release-identity.js";
import { RELEASE_PACKAGES, RELEASE_REPO } from "./release-shared.js";
import {
  capture,
  foreignGitEnvironment,
  requireForeignGitRoot,
  run,
  runIn,
} from "./release-command.js";
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
  mapWithConcurrency,
  observePublication,
  publicationHttpError,
  publishImmutableCohort,
  publishImmutableInDependencyOrder,
  readNpmPublication,
  releaseCohortTarballPath,
  releaseBoundaryError,
  reconcileNpmStableTag,
  SupersededRelease,
} from "./release-publication.js";
import { formulaVersion, prepareFormula } from "./release-formula.js";
import { decodeGitHubReleaseAssetView } from "./release-github-release-api.js";

import { loadNpmPublicationAuth, npmPublicationProcessEnvironment } from "./release-npm-auth.js";

const version = process.argv[2];
const tag = process.argv[3];
const assets = resolve("release-assets");
const npmCohort = resolve("release-npm");
const releaseCommit = process.argv[4];
const preflightOnly = process.argv.includes("--preflight");
if (version === undefined || tag !== `cli-v${version}` || releaseCommit === undefined)
  throw new Error("Expected <version> <cli-vVERSION> <release-commit>.");
requireFullSha(releaseCommit, "Release commit");
requireStableVersion(version);
guardPublicationVersion(version, null, "candidate");

const npmAuthentication = await Effect.runPromise(
  loadNpmPublicationAuth(ConfigProvider.fromEnvRecord(process.env)),
);
const publicationEnvironment = (name: string, packageExists: boolean): NodeJS.ProcessEnv => {
  return npmPublicationProcessEnvironment(name, packageExists, npmAuthentication, process.env);
};

validateReleaseAssets(assets);
await validateReleaseCohort(npmCohort, version, releaseCommit);

const readFormula = async (
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<string> => {
  const requestSignal =
    signal === undefined
      ? AbortSignal.timeout(30_000)
      : AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const response = await fetchImplementation(
    "https://api.github.com/repos/agentxm/homebrew-tap/contents/Formula/axm.rb?ref=main",
    {
      headers: {
        Accept: "application/vnd.github.raw+json",
        "Cache-Control": "no-cache",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      cache: "no-store",
      signal: requestSignal,
    },
  );
  if (response.status !== 200)
    throw publicationHttpError("Homebrew formula query failed", response);
  return response.text();
};
const latestGuard = async (name: string, signal?: AbortSignal) => {
  const metadata = await readNpmPublication(name, version, fetch, signal);
  publicationEnvironment(name, metadata.packageExists);
  guardPublicationVersion(version, metadata.latest, name);
  return metadata;
};
const checksums = parseChecksumManifest(readFileSync(join(assets, CHECKSUM_MANIFEST), "utf8"));
const temporary = mkdtempSync(join(tmpdir(), "axm-publication-"));
const output = (key: string, value: string) => {
  if (process.env["GITHUB_OUTPUT"] !== undefined)
    appendFileSync(process.env["GITHUB_OUTPUT"], `${key}=${value}\n`);
};

try {
  const preflight = async () => {
    await Promise.all([
      mapWithConcurrency(RELEASE_PACKAGES, 6, async (pkg) => latestGuard(pkg.name)),
      readFormula().then((formula) =>
        guardPublicationVersion(version, formulaVersion(formula), "Homebrew"),
      ),
    ]);
  };

  if (preflightOnly) {
    try {
      await preflight();
      output("outcome", "ready");
      console.log(`Release distribution preflight: ${version} is ready.`);
    } catch (error) {
      if (error instanceof SupersededRelease) {
        output("outcome", "superseded");
        console.log(error.message);
      } else {
        throw error;
      }
    }
  } else {
    const outcome = await Effect.runPromise(
      distributeRelease(
        // Global preflight prevents historical repair when any distribution owner
        // already exposes a newer version, regardless of canonical queue order.
        Effect.tryPromise({ try: () => preflight(), catch: releaseBoundaryError }),
        [
          {
            name: "artifacts",
            publish: () =>
              Effect.tryPromise({
                try: async () => {
                  const readAsset = async (name: string): Promise<string | null> => {
                    const release = decodeGitHubReleaseAssetView(
                      capture("gh", [
                        "release",
                        "view",
                        tag,
                        "--repo",
                        RELEASE_REPO,
                        "--json",
                        "targetCommitish,assets",
                      ]),
                    );
                    if (release.targetCommitish !== releaseCommit)
                      throw new Error(
                        `GitHub Release target integrity conflict: expected ${releaseCommit}, observed ${release.targetCommitish}.`,
                      );
                    if (!release.assets.some((asset) => asset.name === name)) return null;
                    const directory = mkdtempSync(join(temporary, "asset-"));
                    run("gh", [
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
                    return contentIntegrity(readFileSync(join(directory, name)));
                  };
                  await publishImmutableCohort(
                    EXPECTED_RELEASE_ASSETS.map((name) => ({
                      name,
                      integrity: contentIntegrity(readFileSync(join(assets, name))),
                      read: () => readAsset(name),
                      publish: async () => {
                        run("gh", [
                          "release",
                          "upload",
                          tag,
                          join(assets, name),
                          "--repo",
                          RELEASE_REPO,
                        ]);
                      },
                    })),
                    { concurrency: 3 },
                  );
                },
                catch: releaseBoundaryError,
              }),
          },
          {
            name: "npm",
            publish: () =>
              Effect.gen(function* () {
                const publications = RELEASE_PACKAGES.map((pkg) => {
                  const tarball = releaseCohortTarballPath(npmCohort, pkg.tarballPrefix, version);
                  const integrity = contentIntegrity(readFileSync(tarball));
                  return {
                    name: `${pkg.name}@${version}`,
                    integrity,
                    read: async (signal: AbortSignal) =>
                      (await latestGuard(pkg.name, signal)).integrity,
                    publish: async () => {
                      const metadata = await latestGuard(pkg.name);
                      const publicationEnv = publicationEnvironment(
                        pkg.name,
                        metadata.packageExists,
                      );
                      run(
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
                        publicationEnv,
                      );
                    },
                  };
                });
                // npm acknowledged two 0.33.0 uploads before registry reads exposed them
                // more than two minutes later. Keep each dependency readback bounded.
                yield* publishImmutableInDependencyOrder(publications, { timeoutMs: 360_000 });
                yield* Effect.tryPromise({
                  try: () =>
                    mapWithConcurrency(RELEASE_PACKAGES, 6, async (pkg) =>
                      reconcileNpmStableTag({
                        name: pkg.name,
                        version,
                        read: async (signal) => (await latestGuard(pkg.name, signal)).latest,
                        promote: async () => {
                          await latestGuard(pkg.name);
                          const publicationEnv = publicationEnvironment(pkg.name, true);
                          run(
                            "npm",
                            ["dist-tag", "add", `${pkg.name}@${version}`, "latest"],
                            publicationEnv,
                          );
                        },
                      }),
                    ),
                  catch: releaseBoundaryError,
                });
              }),
          },
          {
            name: "tap",
            publish: () =>
              Effect.tryPromise({
                try: async () => {
                  const formula = await readFormula();
                  const candidate = prepareFormula(formula, version, RELEASE_REPO, checksums);
                  if (!candidate.changed) return;
                  const token = process.env["HOMEBREW_TAP_TOKEN"];
                  if (token === undefined || token === "")
                    throw new Error(
                      "HOMEBREW_TAP_TOKEN is required to publish the missing formula.",
                    );
                  const tap = join(temporary, "tap");
                  run(
                    "git",
                    ["clone", "--depth", "1", "https://github.com/agentxm/homebrew-tap.git", tap],
                    foreignGitEnvironment(),
                  );
                  requireForeignGitRoot(tap, tap);
                  const env = {
                    ...foreignGitEnvironment(),
                    HOMEBREW_TAP_DIR: tap,
                    RELEASE_ASSET_DIR: assets,
                    GIT_CONFIG_COUNT: "1",
                    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
                    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
                  };
                  try {
                    runIn(
                      process.cwd(),
                      "pnpm",
                      ["exec", "nx", "run", "axm:update-homebrew-formula", "--", version],
                      env,
                    );
                  } catch (cause) {
                    try {
                      await observePublication({
                        name: `Homebrew formula ${version}`,
                        read: async (signal) =>
                          prepareFormula(
                            await readFormula(signal),
                            version,
                            RELEASE_REPO,
                            checksums,
                          ),
                        matches: (observed) => !observed.changed,
                        retryError: isTransientPublicationError,
                      });
                    } catch (readbackFailure) {
                      throw new AggregateError(
                        [cause, readbackFailure],
                        "Homebrew submission and bounded public readback failed.",
                        { cause: readbackFailure },
                      );
                    }
                  }
                  await observePublication({
                    name: `Homebrew formula ${version}`,
                    read: async (signal) =>
                      prepareFormula(await readFormula(signal), version, RELEASE_REPO, checksums),
                    matches: (candidate) => !candidate.changed,
                    retryError: isTransientPublicationError,
                  });
                },
                catch: releaseBoundaryError,
              }),
          },
        ],
        (states) => output("publication", JSON.stringify(states)),
      ),
    );
    output("outcome", outcome);
    console.log(`Release distribution: ${outcome}.`);
  }
} catch (error) {
  output("outcome", "distribution-failed");
  throw error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
