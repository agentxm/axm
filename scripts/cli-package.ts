import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

const manifestFields = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
const manifestJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));

export class CliPackageError extends Data.TaggedError("CliPackageError")<{
  readonly message: string;
}> {}

/** Preserve declarations and Node resolution by shipping private compiled packages intact. */
export const composeCliManifest = (
  cli: Readonly<Record<string, unknown>>,
  internal: ReadonlyArray<Readonly<Record<string, unknown>>>,
) =>
  Effect.gen(function* () {
    const root = yield* Schema.decodeUnknownEffect(manifestFields)(cli);
    const packages = yield* Effect.forEach(internal, (manifest) =>
      Schema.decodeUnknownEffect(manifestFields)(manifest),
    );
    const names = new Set(packages.map(({ name }) => name));
    const required = new Map(Object.entries(root.dependencies ?? {}));
    const optional = new Map(Object.entries(root.optionalDependencies ?? {}));
    for (const pkg of packages) {
      required.set(pkg.name, pkg.version);
      for (const [field, entries] of [
        ["dependencies", pkg.dependencies],
        ["peerDependencies", pkg.peerDependencies],
        ["optionalDependencies", pkg.optionalDependencies],
      ] as const) {
        for (const [name, reference] of Object.entries(entries ?? {})) {
          if (names.has(name)) continue;
          const previous = required.get(name) ?? optional.get(name);
          if (previous !== undefined && previous !== reference) {
            return yield* new CliPackageError({
              message: `CLI dependency ${name} has conflicting references ${previous} and ${reference}.`,
            });
          }
          if (field === "optionalDependencies" && !required.has(name)) {
            optional.set(name, reference);
          } else {
            required.set(name, reference);
            optional.delete(name);
          }
        }
      }
    }
    return {
      ...cli,
      dependencies: Object.fromEntries([...required].sort(([a], [b]) => a.localeCompare(b, "en"))),
      optionalDependencies: Object.fromEntries(
        [...optional].sort(([a], [b]) => a.localeCompare(b, "en")),
      ),
      bundleDependencies: [...names].sort(),
    };
  });

/** Called only by the canonical cohort packer, after the declared builds finish. */
export const packCliPackage = (options: {
  readonly repository: string;
  readonly destination: string;
  readonly internalPackages: ReadonlyArray<{ readonly name: string; readonly directory: string }>;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const processes = yield* ChildProcessSpawner;
      // Outside the source workspace: packlist must not find and bundle its external dependencies.
      const staging = yield* fs.makeTempDirectoryScoped({ prefix: "axm-cli-package-" });
      const packageRoot = path.join(staging, "package");
      yield* fs.makeDirectory(packageRoot);
      const readManifest = (file: string) =>
        fs.readFileString(file).pipe(Effect.flatMap(Schema.decodeUnknownEffect(manifestJson)));
      const execute = (cwd: string, command: string, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const code = yield* processes.exitCode(
            ChildProcess.make(command, args, { cwd, stdout: "ignore", stderr: "inherit" }),
          );
          if (code !== 0) {
            return yield* new CliPackageError({
              message: `CLI packaging failed: ${command} ${args.join(" ")} (exit ${code}).`,
            });
          }
        });
      const unpack = (tarball: string, destination: string) =>
        execute(staging, "tar", ["-xzf", tarball, "--strip-components=1", "-C", destination]);
      const packWorkspace = (name: string, directory: string) =>
        Effect.gen(function* () {
          const source = yield* readManifest(
            path.join(options.repository, directory, "package.json"),
          );
          const manifest = yield* Schema.decodeUnknownEffect(manifestFields)(source);
          yield* execute(options.repository, "pnpm", [
            "--filter",
            name,
            "pack",
            "--pack-destination",
            staging,
          ]);
          return path.join(
            staging,
            `${name.replace(/^@/u, "").replace(/\//gu, "-")}-${manifest.version}.tgz`,
          );
        });
      const cliTarball = yield* packWorkspace("axm.sh", "apps/cli");
      yield* unpack(cliTarball, packageRoot);
      const cli = yield* readManifest(path.join(packageRoot, "package.json"));
      // Pack sequentially: pnpm owns shared workspace metadata and each pack consumes built output.
      const internal = yield* Effect.forEach(options.internalPackages, (pkg) =>
        Effect.gen(function* () {
          const tarball = yield* packWorkspace(pkg.name, pkg.directory);
          const directory = path.join(packageRoot, "node_modules", pkg.name);
          yield* fs.makeDirectory(directory, { recursive: true });
          yield* unpack(tarball, directory);
          return yield* readManifest(path.join(directory, "package.json"));
        }),
      );
      const composed = yield* composeCliManifest(cli, internal);
      yield* fs.writeFileString(
        path.join(packageRoot, "package.json"),
        `${JSON.stringify(composed, null, 2)}\n`,
      );
      // This directory really is hoisted; the repository retains its isolated linker and lockfile.
      yield* fs.writeFileString(
        path.join(packageRoot, "pnpm-workspace.yaml"),
        "nodeLinker: hoisted\n",
      );
      yield* execute(packageRoot, "pnpm", [
        "pack",
        "--pack-destination",
        path.resolve(options.repository, options.destination),
      ]);
    }),
  );
