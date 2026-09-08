import { copyFileSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import * as Schema from "effect/Schema";
import * as semver from "semver";
import { RELEASE_PACKAGES } from "./release-shared.js";
import { capture, run, runIn } from "./release-command.js";
import { contentIntegrity } from "./release-publication.js";

const packedManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  bin: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export const validatePack = (tarball: string, name: string, version: string) => {
  const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(packedManifest))(
    capture("tar", ["-xOf", tarball, "package/package.json"]),
  );
  if (manifest.name !== name || manifest.version !== version)
    throw new Error(`Packed coordinate differs for ${name}.`);
  const files = new Set(capture("tar", ["-tzf", tarball]).split("\n"));
  if (name === "axm.sh" && !/^\.?\/?dist\/.*\.js$/u.test(manifest.bin?.["axm"] ?? ""))
    throw new Error("Packed CLI must expose its compiled bin.");
  for (const file of Object.values(manifest.bin ?? {})) {
    if (!files.has(`package/${file.replace(/^\.\//u, "")}`))
      throw new Error(`Missing packed executable: ${name}/${file}.`);
  }
  for (const [dependency, reference] of Object.entries({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  })) {
    if (
      reference.startsWith("workspace:") ||
      reference.startsWith("file:") ||
      reference.startsWith("link:")
    )
      throw new Error(`Nonportable packed dependency: ${dependency}.`);
    if (
      RELEASE_PACKAGES.some((pkg) => pkg.name === dependency) &&
      !semver.satisfies(version, reference)
    )
      throw new Error(`Packed cohort dependency mismatch: ${dependency}@${reference}.`);
  }
};

const orderedJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(orderedJson);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, orderedJson(child)]),
    );
  return value;
};

/** pnpm resolves workspace/catalog references concurrently; normalize key order
 * before npm's portable deterministic tar writer produces the published bytes. */
const canonicalizePack = (tarball: string, destination: string): void => {
  const packDestination = resolve(destination);
  const staging = mkdtempSync(join(packDestination, "unpacked-"));
  try {
    run("tar", ["-xzf", tarball, "-C", staging]);
    const packageRoot = join(staging, "package");
    const manifestPath = join(packageRoot, "package.json");
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, `${JSON.stringify(orderedJson(manifest), null, 2)}\n`);
    runIn(packageRoot, "npm", ["pack", "--ignore-scripts", "--pack-destination", packDestination]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
};

export const packReleaseCohort = (version: string, directory: string): string => {
  const first = join(directory, "first");
  const second = join(directory, "second");
  mkdirSync(first);
  mkdirSync(second);
  for (const pkg of RELEASE_PACKAGES) {
    const filename = `${pkg.tarballPrefix}${version}.tgz`;
    for (const destination of [first, second]) {
      run("pnpm", ["--filter", pkg.name, "pack", "--pack-destination", destination]);
      canonicalizePack(join(destination, filename), destination);
    }
    const tarball = join(first, filename);
    validatePack(tarball, pkg.name, version);
    if (
      contentIntegrity(readFileSync(tarball)) !==
      contentIntegrity(readFileSync(join(second, filename)))
    )
      throw new Error(`Nondeterministic release pack: ${pkg.name}.`);
  }
  return first;
};

const releaseCohortManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  commit: Schema.String,
  version: Schema.String,
  packages: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      filename: Schema.String,
      integrity: Schema.String,
    }),
  ),
});

export type ReleaseCohortManifest = typeof releaseCohortManifest.Type;
export const RELEASE_COHORT_MANIFEST = "release-cohort.json";

export const produceReleaseCohort = (
  version: string,
  commit: string,
  outputDirectory: string,
): ReleaseCohortManifest => {
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error("Expected an exact release commit SHA.");
  mkdirSync(outputDirectory, { recursive: true });
  const staging = mkdtempSync(join(outputDirectory, ".pack-"));
  try {
    const packed = packReleaseCohort(version, staging);
    const packages = RELEASE_PACKAGES.map((pkg) => {
      const filename = `${pkg.tarballPrefix}${version}.tgz`;
      const source = join(packed, filename);
      copyFileSync(source, join(outputDirectory, filename));
      return {
        name: pkg.name,
        filename,
        integrity: contentIntegrity(readFileSync(source)),
      };
    });
    const manifest = { schemaVersion: 1, commit, version, packages } as const;
    writeFileSync(
      join(outputDirectory, RELEASE_COHORT_MANIFEST),
      `${JSON.stringify(manifest, undefined, 2)}\n`,
    );
    return manifest;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
};

export const validateReleaseCohort = (
  directory: string,
  version: string,
  commit: string,
): ReleaseCohortManifest => {
  const decoded: unknown = JSON.parse(
    readFileSync(join(directory, RELEASE_COHORT_MANIFEST), "utf8"),
  );
  const manifest = validateReleaseCohortManifest(decoded, version, commit);

  for (const pkg of RELEASE_PACKAGES) {
    const expectedFilename = `${pkg.tarballPrefix}${version}.tgz`;
    const entry = manifest.packages.find((candidate) => candidate.name === pkg.name);
    if (entry === undefined) throw new Error(`Release cohort is missing ${pkg.name}@${version}.`);
    const tarball = join(directory, expectedFilename);
    if (contentIntegrity(readFileSync(tarball)) !== entry.integrity)
      throw new Error(`Release cohort integrity mismatch: ${pkg.name}@${version}.`);
    validatePack(tarball, pkg.name, version);
  }
  return manifest;
};

export const validateReleaseCohortManifest = (
  value: unknown,
  version: string,
  commit: string,
): ReleaseCohortManifest => {
  const manifest = Schema.decodeUnknownSync(releaseCohortManifest)(value);
  if (manifest.version !== version) throw new Error("Release cohort version does not match tag.");
  if (manifest.commit !== commit) throw new Error("Release cohort commit does not match tag.");
  if (manifest.packages.length !== RELEASE_PACKAGES.length)
    throw new Error("Release cohort is incomplete.");

  for (const pkg of RELEASE_PACKAGES) {
    const expectedFilename = `${pkg.tarballPrefix}${version}.tgz`;
    const entries = manifest.packages.filter((entry) => entry.name === pkg.name);
    if (entries.length !== 1 || entries[0]?.filename !== expectedFilename)
      throw new Error(`Release cohort is missing ${pkg.name}@${version}.`);
  }
  return manifest;
};
