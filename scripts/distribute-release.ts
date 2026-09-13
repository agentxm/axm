import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as Schema from "effect/Schema";
import { validateReleaseCohort } from "./release-packages.js";
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
  EXPECTED_BINARY_ASSETS,
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
  readNpmPublication,
  reconcileNpmStableTag,
  SupersededRelease,
} from "./release-publication.js";
import { formulaVersion, prepareFormula } from "./release-formula.js";

const version = process.argv[2];
const tag = process.argv[3];
const assets = resolve(process.argv[4] ?? "release-assets");
const npmCohort = resolve(process.argv[5] ?? "release-npm");
const releaseCommit = process.argv[6];
const preflightOnly = process.argv.includes("--preflight");
if (
  version === undefined ||
  tag !== `cli-v${version}` ||
  releaseCommit === undefined ||
  !/^[0-9a-f]{40}$/u.test(releaseCommit)
)
  throw new Error(
    "Expected <version> <cli-vVERSION> <asset-directory> <npm-cohort-directory> <release-commit>.",
  );
guardPublicationVersion(version, null, "candidate");
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
    "https://raw.githubusercontent.com/agentxm/homebrew-tap/main/Formula/axm.rb",
    { cache: "no-store", signal: requestSignal },
  );
  if (response.status !== 200)
    throw publicationHttpError("Homebrew formula query failed", response);
  return response.text();
};
const latestGuard = async (name: string, signal?: AbortSignal) => {
  const metadata = await readNpmPublication(name, version, fetch, signal);
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
    const outcome = await distributeRelease(
      // Global preflight prevents historical repair when any distribution owner
      // already exposes a newer version, regardless of canonical queue order.
      preflight,
      [
        {
          name: "artifacts",
          publish: async () => {
            const readAsset = async (name: string): Promise<string | null> => {
              const release = Schema.decodeUnknownSync(
                Schema.fromJsonString(
                  Schema.Struct({ assets: Schema.Array(Schema.Struct({ name: Schema.String })) }),
                ),
              )(capture("gh", ["api", `repos/${RELEASE_REPO}/releases/tags/${tag}`]));
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
              [...EXPECTED_BINARY_ASSETS, CHECKSUM_MANIFEST].map((name) => ({
                name,
                integrity: contentIntegrity(readFileSync(join(assets, name))),
                read: () => readAsset(name),
                publish: async () => {
                  run("gh", ["release", "upload", tag, join(assets, name), "--repo", RELEASE_REPO]);
                },
              })),
              { concurrency: 3 },
            );
          },
        },
        {
          name: "npm",
          publish: async () => {
            const publicationEnv = { ...process.env };
            delete publicationEnv["NODE_AUTH_TOKEN"];
            delete publicationEnv["NPM_CONFIG_USERCONFIG"];
            const publications = RELEASE_PACKAGES.map((pkg) => {
              const tarball = join(npmCohort, `${pkg.tarballPrefix}${version}.tgz`);
              const integrity = contentIntegrity(readFileSync(tarball));
              return {
                name: `${pkg.name}@${version}`,
                integrity,
                read: async (signal: AbortSignal) =>
                  (await latestGuard(pkg.name, signal)).integrity,
                publish: async () => {
                  await latestGuard(pkg.name);
                  run(
                    "npm",
                    ["publish", tarball, "--provenance", "--access", "public", "--tag", "latest"],
                    publicationEnv,
                  );
                },
              };
            });
            await publishImmutableCohort(publications, { concurrency: 6, timeoutMs: 120_000 });
            await mapWithConcurrency(RELEASE_PACKAGES, 6, async (pkg) =>
              reconcileNpmStableTag({
                name: pkg.name,
                version,
                read: async (signal) => (await latestGuard(pkg.name, signal)).latest,
                promote: async () => {
                  await latestGuard(pkg.name);
                  run(
                    "npm",
                    ["dist-tag", "add", `${pkg.name}@${version}`, "latest"],
                    publicationEnv,
                  );
                },
              }),
            );
          },
        },
        {
          name: "tap",
          publish: async () => {
            const formula = await readFormula();
            const candidate = prepareFormula(formula, version, RELEASE_REPO, checksums);
            if (!candidate.changed) return;
            const token = process.env["HOMEBREW_TAP_TOKEN"];
            if (token === undefined || token === "")
              throw new Error("HOMEBREW_TAP_TOKEN is required to publish the missing formula.");
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
                    prepareFormula(await readFormula(signal), version, RELEASE_REPO, checksums),
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
        },
      ],
      (states) => output("publication", JSON.stringify(states)),
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
