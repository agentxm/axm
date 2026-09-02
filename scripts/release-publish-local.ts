/**
 * Publish a local preview of the axm npm packages.
 *
 * Builds, version-stamps, packs, and `npm publish`es the release-group
 * packages (the `release:cli` tag group) under a non-default dist-tag
 * (default: `preview`). The version is derived from the
 * working tree so each invocation is unique and stable (`@latest`) consumers
 * are unaffected.
 *
 * This is a developer convenience for fast iteration. The canonical release
 * path is still `pnpm release:publish` driven through GitHub Actions, which
 * adds cross-platform binaries, npm provenance, and Homebrew updates.
 *
 * Usage:
 *   pnpm release:publish:local
 *   pnpm release:publish:local -- --dry-run
 *   pnpm release:publish:local -- --tag=canary --no-build
 *
 * Install the published preview globally:
 *   npm install -g axm.sh@preview
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { run, tryCapture } from "./release-command.js";
import {
  RELEASE_PACKAGES,
  RELEASE_PACKAGE_JSON_PATHS,
  fail,
  git,
  requireMatchingReleasePackageVersions,
  runNx,
  validateReleaseVersion,
} from "./release-shared.js";

const PACK_DESTINATION = "release-packages-local";

const args = process.argv.slice(2);

const showHelp = () => {
  console.log(
    [
      "Usage: pnpm release:publish:local [-- --dry-run] [--tag=<dist-tag>] [--no-build]",
      "",
      "Builds, packs, and `npm publish`es the fixed release-group packages",
      "under a dist-tag (default: preview). The default `latest` tag is never",
      "touched, so stable consumers are unaffected.",
      "",
      "Install the published preview:",
      "  npm install -g axm.sh@<dist-tag>",
    ].join("\n"),
  );
};

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const skipBuild = args.includes("--no-build");

const tagArg = args.find((arg) => arg.startsWith("--tag="));
const distTag = tagArg?.slice("--tag=".length) ?? "preview";
if (distTag.length === 0) {
  fail("`--tag=` requires a non-empty value.");
}
if (distTag === "latest") {
  fail("Refusing to publish under `latest`. Use the canonical release flow.");
}

const KNOWN_FLAGS = new Set(["--dry-run", "--no-build", "--help", "-h"]);
const unknownFlags = args.filter((arg) => {
  if (!arg.startsWith("-")) {
    return false;
  }
  const head = arg.split("=", 1)[0] ?? arg;
  return head !== "--tag" && !KNOWN_FLAGS.has(head);
});
if (unknownFlags.length > 0) {
  fail(`Unknown flag(s): ${unknownFlags.join(", ")}`);
}

const derivePreviewVersion = (base: string): string => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(base);
  if (match == null) {
    return fail(`Base version is not valid semver: ${base}`);
  }

  const major = match[1] ?? fail(`Unreachable: missing major in ${base}`);
  const minor = match[2] ?? fail(`Unreachable: missing minor in ${base}`);
  const patchString = match[3] ?? fail(`Unreachable: missing patch in ${base}`);
  const nextPatch = Number(patchString) + 1;

  const shortSha = git("rev-parse", "--short", "HEAD");
  const dirty = git("status", "--porcelain").length > 0;
  const tail = dirty ? `${shortSha}.dirty` : shortSha;
  const seconds = Math.floor(Date.now() / 1000);

  return validateReleaseVersion(`${major}.${minor}.${nextPatch}-preview.${seconds}.${tail}`);
};

const stampVersion = (originalContent: string, version: string, source: string): string => {
  const updated = originalContent.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
  if (updated === originalContent) {
    fail(`Could not stamp version field in ${source}.`);
  }
  return updated;
};

type ManifestSnapshot = { readonly path: string; readonly original: string };

const snapshotManifests = (): readonly ManifestSnapshot[] =>
  RELEASE_PACKAGE_JSON_PATHS.map((path) => ({
    path,
    original: readFileSync(path, "utf8"),
  }));

const restoreManifests = (snapshots: readonly ManifestSnapshot[]) => {
  for (const { path, original } of snapshots) {
    writeFileSync(path, original, "utf8");
  }
};

const writeStampedManifests = (snapshots: readonly ManifestSnapshot[], version: string) => {
  for (const { path, original } of snapshots) {
    writeFileSync(path, stampVersion(original, version, path), "utf8");
  }
};

const requireNpmLogin = (): string => {
  const result = tryCapture("npm", ["whoami"]);
  if (!result.ok) {
    return fail(`Not logged in to npm. Run \`npm login\` first.\n${result.stderr}`);
  }
  return result.stdout;
};

const buildReleasePackages = () => {
  if (skipBuild) {
    console.log("==> Skipping build (--no-build)");
    return;
  }
  console.log("==> Building the CLI release group");
  runNx("run-many", "-t", "build", "--projects", "tag:release:cli");
};

const packReleasePackages = (packDestAbsolute: string) => {
  rmSync(packDestAbsolute, { recursive: true, force: true });
  mkdirSync(packDestAbsolute, { recursive: true });

  for (const { name } of RELEASE_PACKAGES) {
    run("pnpm", ["--filter", name, "pack", "--pack-destination", packDestAbsolute]);
  }
};

const publishReleasePackages = (packDestAbsolute: string, version: string) => {
  for (const { tarballPrefix } of RELEASE_PACKAGES) {
    const tarball = `${packDestAbsolute}/${tarballPrefix}${version}.tgz`;
    const publishArgs = ["publish", tarball, "--tag", distTag, "--access", "public"];
    if (dryRun) {
      publishArgs.push("--dry-run");
    }
    run("npm", publishArgs);
  }
};

const main = () => {
  const baseVersion = requireMatchingReleasePackageVersions();
  const previewVersion = derivePreviewVersion(baseVersion);
  const packDestAbsolute = resolve(PACK_DESTINATION);

  console.log("==> Local preview publish");
  console.log(`  Base version: ${baseVersion}`);
  console.log(`  Preview version: ${previewVersion}`);
  console.log(`  Dist-tag: ${distTag}`);
  console.log(`  Pack destination: ${packDestAbsolute}`);
  if (dryRun) {
    console.log("  Mode: dry-run (npm publish --dry-run)");
  }
  if (!dryRun) {
    const npmUser = requireNpmLogin();
    console.log(`  npm user: ${npmUser}`);
  }

  buildReleasePackages();

  const snapshots = snapshotManifests();
  try {
    writeStampedManifests(snapshots, previewVersion);
    packReleasePackages(packDestAbsolute);
  } finally {
    restoreManifests(snapshots);
  }

  publishReleasePackages(packDestAbsolute, previewVersion);

  console.log("");
  console.log(`Published preview ${previewVersion} under dist-tag \`${distTag}\`.`);
  console.log(`Install with: npm install -g axm.sh@${distTag}`);
};

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
