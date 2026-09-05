import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
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
  const staging = mkdtempSync(join(destination, "unpacked-"));
  try {
    run("tar", ["-xzf", tarball, "-C", staging]);
    const packageRoot = join(staging, "package");
    const manifestPath = join(packageRoot, "package.json");
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(manifestPath, `${JSON.stringify(orderedJson(manifest), null, 2)}\n`);
    runIn(packageRoot, "npm", ["pack", "--ignore-scripts", "--pack-destination", destination]);
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
