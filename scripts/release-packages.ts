import { join } from "node:path";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as semver from "semver";
import { publint } from "publint";
import { formatMessage } from "publint/utils";
import { RELEASE_PACKAGES } from "./release-shared.js";
import { requireFullSha } from "./release-identity.js";
import {
  captureReleaseCommand,
  releaseValidation,
  ReleaseValidationFailed,
  runReleaseCommand,
} from "./release-process.js";
import { contentIntegrity } from "./release-publication.js";
import { packCliPackage } from "./cli-package.js";
import { readProductionPackages } from "./production-packages.js";

const packedManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  bin: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
const bundledEffectManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const stampBootstrapManifest = (original: string, path: string, version: string): string => {
  const decoded: unknown = JSON.parse(original);
  if (!isRecord(decoded) || typeof decoded["version"] !== "string") {
    throw new Error(`Could not stamp version field in ${path}.`);
  }
  decoded["version"] = version;

  return stampBootstrapCohortReferences(JSON.stringify(decoded), version);
};

/** Pin bundled implementation packages' references to the preview cohort. */
export const stampBootstrapCohortReferences = (original: string, version: string): string => {
  const decoded: unknown = JSON.parse(original);
  if (!isRecord(decoded)) throw new Error("Could not stamp cohort references in package manifest.");

  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = decoded[section];
    if (!isRecord(dependencies)) continue;
    for (const pkg of RELEASE_PACKAGES) {
      if (pkg.name in dependencies) dependencies[pkg.name] = version;
    }
  }

  return `${JSON.stringify(decoded, undefined, 2)}\n`;
};

/** Stamp the bundled official skill to the exact prerelease CLI version. */
export const stampBootstrapSkillDocument = (original: string, version: string): string => {
  const replaceOnce = (input: string, key: string): string => {
    const pattern = new RegExp(`^([ \\t]*)${key}:.*$`, "gm");
    const matches = [...input.matchAll(pattern)];
    if (matches.length !== 1) throw new Error(`Expected one ${key} in the AXM skill document.`);
    return input.replace(pattern, `$1${key}: "${version}"`);
  };
  return replaceOnce(replaceOnce(original, "axm.sh/cli-version"), "axm.sh/cli-version-range");
};

export const validatePack = (tarball: string, name: string, version: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(packedManifest))(
      yield* captureReleaseCommand("tar", ["-xOf", tarball, "package/package.json"]),
    );
    yield* releaseValidation("Validate packed coordinate", () => {
      if (manifest.name !== name || manifest.version !== version)
        throw new Error(`Packed coordinate differs for ${name}.`);
      if (name === "axm.sh" && !/^\.?\/?dist\/.*\.js$/u.test(manifest.bin?.["axm"] ?? ""))
        throw new Error("Packed CLI must expose its compiled bin.");
    });
    if (name === "axm.sh") {
      for (const bundled of ["@effect/platform-node", "@effect/platform-node-shared"]) {
        yield* releaseValidation("Validate bundled Effect dependency", () => {
          if (manifest.dependencies?.[bundled] !== undefined)
            throw new Error(`Packed CLI must resolve ${bundled} from its tested bundle.`);
        });
        const embedded = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(bundledEffectManifest),
        )(
          yield* captureReleaseCommand("tar", [
            "-xOf",
            tarball,
            `package/dist/node_modules/${bundled}/package.json`,
          ]),
        );
        yield* releaseValidation("Validate bundled Effect version", () => {
          if (embedded.name !== bundled || embedded.version !== manifest.dependencies?.["effect"])
            throw new Error(`Packed CLI has an incompatible bundled ${bundled} version.`);
        });
      }
    }
    yield* releaseValidation("Validate packed dependencies", () => {
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
        const isCohortDependency = RELEASE_PACKAGES.some((pkg) => pkg.name === dependency);
        if (isCohortDependency && !semver.satisfies(version, reference))
          throw new Error(`Packed cohort dependency mismatch: ${dependency}@${reference}.`);
        if (isCohortDependency && semver.prerelease(version) !== null && reference !== version)
          throw new Error(
            `Packed bootstrap cohort dependency must be exact: ${dependency}@${reference}.`,
          );
      }
    });
    const bytes = yield* fs.readFile(tarball);
    // publint is a Promise-only library; the release workflow stays in Effect.
    const { messages, pkg } = yield* Effect.tryPromise({
      try: () =>
        publint({ pack: { tarball: Uint8Array.from(bytes).buffer }, strict: true, level: "error" }),
      catch: (cause) =>
        new ReleaseValidationFailed({
          operation: `Inspect packed package ${name}@${version}`,
          cause,
        }),
    });
    yield* releaseValidation("Validate packed package contract", () => {
      if (messages.length > 0)
        throw new Error(
          `Invalid packed package ${name}@${version}:\n${messages.map((message) => `${message.code}: ${formatMessage(message, pkg, { color: false }) ?? message.code}`).join("\n")}`,
        );
    });
  });

export const packReleaseCohort = (version: string, directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const first = join(directory, "first");
    const second = join(directory, "second");
    yield* fs.makeDirectory(first);
    yield* fs.makeDirectory(second);
    const published = new Set(RELEASE_PACKAGES.map(({ name }) => name));
    const internalPackages = yield* releaseValidation("Read internal production packages", () =>
      readProductionPackages(process.cwd()).filter(({ name }) => !published.has(name)),
    );
    for (const pkg of RELEASE_PACKAGES) {
      const filename = `${pkg.tarballPrefix}${version}.tgz`;
      for (const destination of [first, second]) {
        if (pkg.name === "axm.sh" && internalPackages.length > 0) {
          yield* packCliPackage({ repository: process.cwd(), destination, internalPackages });
        } else {
          yield* runReleaseCommand("pnpm", [
            "--filter",
            pkg.name,
            "pack",
            "--pack-destination",
            destination,
          ]);
        }
      }
      const tarball = join(first, filename);
      yield* validatePack(tarball, pkg.name, version);
      const firstBytes = yield* fs.readFile(tarball);
      const secondBytes = yield* fs.readFile(join(second, filename));
      yield* releaseValidation("Validate deterministic release pack", () => {
        if (contentIntegrity(firstBytes) !== contentIntegrity(secondBytes))
          throw new Error(`Nondeterministic release pack: ${pkg.name}.`);
      });
    }
    return first;
  });

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

export const produceReleaseCohort = (version: string, commit: string, outputDirectory: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* releaseValidation("Validate release commit", () =>
        requireFullSha(commit, "Release commit"),
      );
      yield* fs.makeDirectory(outputDirectory, { recursive: true });
      const staging = yield* fs.makeTempDirectoryScoped({
        directory: outputDirectory,
        prefix: ".pack-",
      });
      const packed = yield* packReleaseCohort(version, staging);
      const packages = yield* Effect.forEach(RELEASE_PACKAGES, (pkg) =>
        Effect.gen(function* () {
          const filename = `${pkg.tarballPrefix}${version}.tgz`;
          const source = join(packed, filename);
          yield* fs.copyFile(source, join(outputDirectory, filename));
          return {
            name: pkg.name,
            filename,
            integrity: contentIntegrity(yield* fs.readFile(source)),
          };
        }),
      );
      const manifest = { schemaVersion: 1, commit, version, packages } as const;
      yield* fs.writeFileString(
        join(outputDirectory, RELEASE_COHORT_MANIFEST),
        `${JSON.stringify(manifest, undefined, 2)}\n`,
      );
      return manifest;
    }),
  );

export const validateReleaseCohort = (directory: string, version: string, commit: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
      yield* fs.readFileString(join(directory, RELEASE_COHORT_MANIFEST)),
    );
    const manifest = yield* releaseValidation("Validate release cohort manifest", () =>
      validateReleaseCohortManifest(decoded, version, commit),
    );
    for (const pkg of RELEASE_PACKAGES) {
      const expectedFilename = `${pkg.tarballPrefix}${version}.tgz`;
      const entry = manifest.packages.find((candidate) => candidate.name === pkg.name);
      if (entry === undefined)
        return yield* new ReleaseValidationFailed({
          operation: "Validate release cohort",
          cause: `Release cohort is missing ${pkg.name}@${version}.`,
        });
      const tarball = join(directory, expectedFilename);
      const bytes = yield* fs.readFile(tarball);
      yield* releaseValidation("Validate cohort integrity", () => {
        if (contentIntegrity(bytes) !== entry.integrity)
          throw new Error(`Release cohort integrity mismatch: ${pkg.name}@${version}.`);
      });
      yield* validatePack(tarball, pkg.name, version);
    }
    return manifest;
  });

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
