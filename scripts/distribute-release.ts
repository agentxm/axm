import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import { validateReleaseCohort } from "./release-packages.js";
import { RELEASE_PACKAGES, RELEASE_REPO } from "./release-shared.js";
import { capture, run, runIn } from "./release-command.js";
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
  publishImmutable,
  observePublication,
  readNpmPublication,
} from "./release-publication.js";
import { formulaVersion, prepareFormula } from "./release-formula.js";

const version = process.argv[2];
const tag = process.argv[3];
const assets = resolve(process.argv[4] ?? "release-assets");
const npmCohort = resolve(process.argv[5] ?? "release-npm");
if (version === undefined || tag !== `cli-v${version}`)
  throw new Error("Expected <version> <cli-vVERSION> [asset-directory] [npm-cohort-directory].");
guardPublicationVersion(version, null, "candidate");
validateReleaseAssets(assets);
validateReleaseCohort(npmCohort, version, capture("git", ["rev-parse", "HEAD"]));

const readFormula = async (fetchImplementation: typeof fetch = fetch): Promise<string> => {
  const response = await fetchImplementation(
    "https://raw.githubusercontent.com/agentxm/homebrew-tap/main/Formula/axm.rb",
    { cache: "no-store", signal: AbortSignal.timeout(30_000) },
  );
  if (response.status !== 200)
    throw new Error(`Homebrew formula query failed: HTTP ${response.status}.`);
  return response.text();
};
const latestGuard = async (name: string) => {
  const metadata = await readNpmPublication(name, version);
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
  const outcome = await distributeRelease(
    async () => {
      // Global preflight prevents historical repair when any distribution owner
      // already exposes a newer version, regardless of canonical queue order.
      for (const pkg of RELEASE_PACKAGES) await latestGuard(pkg.name);
      guardPublicationVersion(version, formulaVersion(await readFormula()), "Homebrew");
    },
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
          for (const name of [...EXPECTED_BINARY_ASSETS, CHECKSUM_MANIFEST]) {
            await publishImmutable({
              name,
              integrity: contentIntegrity(readFileSync(join(assets, name))),
              read: () => readAsset(name),
              publish: async () => {
                run("gh", ["release", "upload", tag, join(assets, name), "--repo", RELEASE_REPO]);
              },
            });
          }
        },
      },
      {
        name: "npm",
        publish: async () => {
          const publicationEnv = { ...process.env };
          delete publicationEnv["NODE_AUTH_TOKEN"];
          delete publicationEnv["NPM_CONFIG_USERCONFIG"];
          for (const pkg of RELEASE_PACKAGES) {
            const tarball = join(npmCohort, `${pkg.tarballPrefix}${version}.tgz`);
            const integrity = contentIntegrity(readFileSync(tarball));
            await publishImmutable({
              name: `${pkg.name}@${version}`,
              integrity,
              read: async () => (await latestGuard(pkg.name)).integrity,
              publish: async () => {
                await latestGuard(pkg.name);
                run(
                  "npm",
                  ["publish", tarball, "--provenance", "--access", "public", "--tag", "latest"],
                  publicationEnv,
                );
              },
            });
            // A previous interruption may have published identical content before its tag update.
            const metadata = await latestGuard(pkg.name);
            if (metadata.latest !== version) {
              run("npm", ["dist-tag", "add", `${pkg.name}@${version}`, "latest"], publicationEnv);
              await observePublication({
                name: `npm latest ${pkg.name}@${version}`,
                read: async () => (await latestGuard(pkg.name)).latest,
                matches: (latest) => latest === version,
                conflicts: (latest) => latest !== null && semver.gt(latest, version),
              });
            }
          }
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
          run("git", ["clone", "--depth", "1", "https://github.com/agentxm/homebrew-tap.git", tap]);
          const env = {
            ...process.env,
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
                read: async () =>
                  prepareFormula(await readFormula(), version, RELEASE_REPO, checksums),
                matches: (observed) => !observed.changed,
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
            read: async () => prepareFormula(await readFormula(), version, RELEASE_REPO, checksums),
            matches: (candidate) => !candidate.changed,
          });
        },
      },
    ],
    (states) => output("publication", JSON.stringify(states)),
  );
  output("outcome", outcome);
  console.log(`Release distribution: ${outcome}.`);
} catch (error) {
  output("outcome", "distribution-failed");
  throw error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
