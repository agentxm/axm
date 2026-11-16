import {
  makeMemoryFileSystem,
  makeRecordingFileSystem,
  withoutNativeIo,
} from "@agentxm/test-support";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as References from "effect/References";
import * as Schema from "effect/Schema";
import { vi } from "vitest";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { cargoReader } from "./cargo.js";
import { packageReaders } from "./index.js";
import { pypiReader } from "./pypi.js";
import { readLocalRecommendations } from "./read.js";
import type { DetectedPackage } from "./types.js";

const decodeType = Schema.decodeUnknownSync(PackageTypeSchema);
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);
const names = ["alpha", "beta", "gamma"] as const;

const detected = (
  type: string,
  name: string,
  source: string,
  extra: { readonly version?: string; readonly namespace?: string } = { version: "1.0.0" },
): DetectedPackage => ({
  purl: makePurl({ type, name, ...extra }),
  type: decodeType(type),
  source,
});

const extensions = (name: string) => JSON.stringify([{ ref: `@acme/skills/${name}` }]);
const agentExtensionsJson = (name: string) =>
  JSON.stringify({ agentExtensions: [{ ref: `@acme/skills/${name}` }] });

interface Warning {
  readonly message: string;
  readonly reader: unknown;
}

/**
 * Read local recommendations over a fresh in-memory tree written from `files`,
 * counting the filesystem calls of the reads only. The port does not establish
 * OS permissions or path identity; these cases count logical reads of the
 * package-manager roots that every package of one ecosystem shares.
 */
const readRecorded = (input: {
  readonly files: Readonly<Record<string, string>>;
  readonly packages: ReadonlyArray<DetectedPackage>;
  readonly env?: Readonly<Record<string, string>>;
  readonly calls?: number;
}) =>
  Effect.gen(function* () {
    const memory = makeMemoryFileSystem();
    const path = yield* Path.Path;
    for (const [file, content] of Object.entries(input.files)) {
      yield* memory.fileSystem.makeDirectory(path.dirname(file), { recursive: true });
      yield* memory.fileSystem.writeFileString(file, content);
    }
    const recorder = makeRecordingFileSystem(memory.fileSystem);
    const warnings: Array<Warning> = [];
    const logger = Logger.make((entry) => {
      if (entry.logLevel !== "Warn") return;
      warnings.push({
        message: String(entry.message),
        reader: entry.fiber.getRef(References.CurrentLogAnnotations)["reader"],
      });
    });
    const results: Array<ReadonlyArray<readonly [string, ReadonlyArray<string>]>> = [];
    for (let call = 0; call < (input.calls ?? 1); call++) {
      const recommendations = yield* readLocalRecommendations(input.packages, packageReaders).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(FileSystem.FileSystem, recorder.fileSystem),
            ConfigProvider.layer(ConfigProvider.fromEnv({ env: input.env ?? {} })),
            Logger.layer([logger]),
          ),
        ),
      );
      results.push(
        input.packages.flatMap((pkg) =>
          Option.match(HashMap.get(recommendations, pkg), {
            onNone: () => [],
            onSome: (refs) => [[pkg.purl.name, refs.map((entry) => entry.ref)] as const],
          }),
        ),
      );
    }
    expect(memory.failures).toEqual([]);
    return { results, recording: recorder.recording, warnings };
  }).pipe(Effect.provide(Path.layer), withoutNativeIo);

const allFound = names.map((name) => [name, [`@acme/skills/${name}`]] as const);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("package readers share ecosystem roots within one read", () => {
  it.effect("reads one pub package_config.json for every package it lists", () =>
    Effect.gen(function* () {
      const outcome = yield* readRecorded({
        files: {
          "/project/pubspec.yaml": "name: app\n",
          "/project/.dart_tool/package_config.json": JSON.stringify({
            packages: names.map((name) => ({ name, rootUri: `file:///pub-cache/${name}` })),
          }),
          ...Object.fromEntries(
            names.map((name) => [
              `/pub-cache/${name}/pubspec.yaml`,
              `name: ${name}\nagentExtensions: ${extensions(name)}\n`,
            ]),
          ),
        },
        packages: names.map((name) => detected("pub", name, "/project/pubspec.yaml")),
      });
      expect(outcome.recording.counts("/project/.dart_tool/package_config.json")).toEqual({
        readFile: 1,
      });
      for (const name of names) {
        expect(outcome.recording.counts(`/pub-cache/${name}/pubspec.yaml`)).toEqual({
          readFile: 1,
        });
      }
      expect(outcome.results).toEqual([allFound]);
      expect(outcome.warnings).toEqual([]);
    }),
  );

  it.effect("warns once per pub package about one malformed package_config.json", () =>
    Effect.gen(function* () {
      const outcome = yield* readRecorded({
        files: { "/project/.dart_tool/package_config.json": "{ not json" },
        packages: names.map((name) => detected("pub", name, "/project/pubspec.yaml")),
      });
      expect(outcome.recording.counts("/project/.dart_tool/package_config.json")).toEqual({
        readFile: 1,
      });
      expect(outcome.results).toEqual([[]]);
      expect(outcome.warnings).toEqual(
        names.map(() => ({
          message: "Malformed JSON in package_config.json, skipping",
          reader: "pub",
        })),
      );
    }),
  );

  it.effect("reads each pub project's own package_config.json", () =>
    Effect.gen(function* () {
      const outcome = yield* readRecorded({
        files: Object.fromEntries(
          ["one", "two"].flatMap((project) => [
            [
              `/${project}/.dart_tool/package_config.json`,
              JSON.stringify({
                packages: [{ name: "alpha", rootUri: `file:///${project}-cache/alpha` }],
              }),
            ],
            [
              `/${project}-cache/alpha/pubspec.yaml`,
              `name: alpha\nagentExtensions: ${extensions(project)}\n`,
            ],
          ]),
        ),
        packages: ["one", "two"].map((project) =>
          detected("pub", "alpha", `/${project}/pubspec.yaml`),
        ),
      });
      expect(outcome.recording.counts("/one/.dart_tool/package_config.json")).toEqual({
        readFile: 1,
      });
      expect(outcome.recording.counts("/two/.dart_tool/package_config.json")).toEqual({
        readFile: 1,
      });
      expect(outcome.results).toEqual([
        [
          ["alpha", ["@acme/skills/one"]],
          ["alpha", ["@acme/skills/two"]],
        ],
      ]);
    }),
  );

  it.effect("scans the zig cache once while each package keeps its own warnings", () =>
    Effect.gen(function* () {
      vi.stubEnv("HOME", "/home/user");
      const cache = "/home/user/.cache/zig/p";
      const outcome = yield* readRecorded({
        files: {
          [`${cache}/1-malformed/agent-extensions.json`]: "{ not json",
          [`${cache}/2-valid/agent-extensions.json`]: agentExtensionsJson("zig"),
          [`${cache}/3-later/agent-extensions.json`]: agentExtensionsJson("later"),
        },
        packages: names.map((name) =>
          detected("zig", name, "/project/build.zig.zon", { version: "1.0.0" }),
        ),
      });
      expect(outcome.recording.counts(cache)).toEqual({ access: 1, readDirectory: 1 });
      expect(outcome.recording.counts(`${cache}/1-malformed/agent-extensions.json`)).toEqual({
        readFile: 1,
      });
      expect(outcome.recording.counts(`${cache}/2-valid/agent-extensions.json`)).toEqual({
        readFile: 1,
      });
      expect(outcome.recording.counts(`${cache}/3-later/agent-extensions.json`)).toEqual({});
      expect(outcome.results).toEqual([names.map((name) => [name, ["@acme/skills/zig"]])]);
      expect(
        [...outcome.warnings].sort((left, right) => left.message.localeCompare(right.message)),
      ).toEqual(
        names.map((name) => ({
          message: `Malformed JSON in ${name}/agent-extensions.json, skipping`,
          reader: "zig",
        })),
      );
    }),
  );

  it.effect("lists one Python site-packages for every installed distribution", () =>
    Effect.gen(function* () {
      const sitePackages = "/venv/lib/python3.12/site-packages";
      const outcome = yield* readRecorded({
        env: { VIRTUAL_ENV: "/venv" },
        files: Object.fromEntries(
          names.flatMap((name) => [
            [
              `${sitePackages}/${name}-1.0.0.dist-info/entry_points.txt`,
              `[agentExtensions]\n${name} = ${name}:agent-extensions.json\n`,
            ],
            [`${sitePackages}/${name}/agent-extensions.json`, agentExtensionsJson(name)],
          ]),
        ),
        packages: names.map((name) => detected("pypi", name, "/project/requirements.txt")),
      });
      expect(outcome.recording.counts("/venv/lib")).toEqual({ access: 1, readDirectory: 1 });
      expect(outcome.recording.counts(sitePackages)).toEqual({ access: 1, readDirectory: 1 });
      for (const name of names) {
        expect(
          outcome.recording.counts(`${sitePackages}/${name}-1.0.0.dist-info/entry_points.txt`),
        ).toEqual({ readFile: 1 });
      }
      expect(outcome.results).toEqual([allFound]);
    }),
  );

  it.effect("lists the Cargo registry and each index once for every crate", () =>
    Effect.gen(function* () {
      const index = "/cargo/registry/src/index.crates.io";
      const crate = (name: string) =>
        `[package]\nname = "${name}"\n\n[package.metadata]\nagentExtensions = [{ ref = "@acme/skills/${name}" }]\n`;
      const outcome = yield* readRecorded({
        env: { CARGO_HOME: "/cargo" },
        files: Object.fromEntries(
          names.map((name) => [`${index}/${name}-1.0.0/Cargo.toml`, crate(name)]),
        ),
        packages: [
          ...names.map((name) => detected("cargo", name, "/project/Cargo.toml")),
          ...names.map((name) => detected("cargo", name, "/project/Cargo.lock", {})),
        ],
      });
      expect(outcome.recording.counts("/cargo/registry/src")).toEqual({ readDirectory: 1 });
      expect(outcome.recording.counts(index)).toEqual({ readDirectory: 1 });
      for (const name of names) {
        expect(outcome.recording.counts(`${index}/${name}-1.0.0/Cargo.toml`)).toEqual({
          readFile: 2,
        });
      }
      expect(outcome.results).toEqual([[...allFound, ...allFound]]);
    }),
  );

  it.effect("lists the Cabal store and probes dist-newstyle once for every package", () =>
    Effect.gen(function* () {
      vi.stubEnv("HOME", "/home/user");
      const store = "/home/user/.cabal/store";
      const cabal = (name: string) => `name: ${name}\nx-agent-extensions: ${extensions(name)}\n`;
      const outcome = yield* readRecorded({
        files: {
          [`${store}/ghc-9.6.3/alpha-1.0.0/alpha.cabal`]: cabal("alpha"),
          ...Object.fromEntries(
            ["beta", "gamma"].map((name) => [
              `/hs/dist-newstyle/build/${name}-1.0.0/${name}.cabal`,
              cabal(name),
            ]),
          ),
        },
        packages: names.map((name) => detected("hackage", name, "/hs/project.cabal")),
      });
      expect(outcome.recording.counts(store)).toEqual({ readDirectory: 1 });
      expect(outcome.recording.counts("/hs/dist-newstyle")).toEqual({ access: 1 });
      expect(outcome.results).toEqual([allFound]);
    }),
  );

  it.effect("lists the opam switches once for every package", () =>
    Effect.gen(function* () {
      vi.stubEnv("HOME", "/home/user");
      const outcome = yield* readRecorded({
        files: Object.fromEntries(
          names.map((name) => [
            `/home/user/.opam/default/lib/${name}/opam`,
            `opam-version: "2.0"\nx-agent-extensions: ${extensions(name)}\n`,
          ]),
        ),
        packages: names.map((name) => detected("opam", name, "/project/project.opam")),
      });
      expect(outcome.recording.counts("/home/user/.opam")).toEqual({ readDirectory: 1 });
      expect(outcome.results).toEqual([allFound]);
    }),
  );

  it.effect("lists the pixi environments and their conda-meta once for every package", () =>
    Effect.gen(function* () {
      const envs = "/mojo/.pixi/envs";
      const outcome = yield* readRecorded({
        files: Object.fromEntries(
          names.map((name) => [
            `${envs}/default/conda-meta/${name}-1.0.0/agent-extensions.json`,
            agentExtensionsJson(name),
          ]),
        ),
        packages: names.map((name) => detected("mojo", name, "/mojo/pixi.toml")),
      });
      expect(outcome.recording.counts(envs)).toEqual({ access: 1, readDirectory: 1 });
      expect(outcome.recording.counts(`${envs}/default/conda-meta`)).toEqual({
        access: 1,
        readDirectory: 1,
      });
      expect(outcome.results).toEqual([allFound]);
    }),
  );

  it.effect("probes the Deno cache roots once for every JSR package", () =>
    Effect.gen(function* () {
      const registry = "/deno/registries/jsr.io";
      const outcome = yield* readRecorded({
        env: { DENO_DIR: "/deno" },
        files: Object.fromEntries(
          names.map((name) => [
            `${registry}/@acme/${name}/1.0.0/deno.json`,
            agentExtensionsJson(name),
          ]),
        ),
        packages: names.map((name) =>
          detected("jsr", name, "/project/deno.json", { namespace: "@acme", version: "1.0.0" }),
        ),
      });
      expect(outcome.recording.counts("/deno")).toEqual({ access: 1 });
      expect(outcome.recording.counts(registry)).toEqual({ access: 1 });
      for (const name of names) {
        expect(outcome.recording.counts(`${registry}/@acme/${name}`)).toEqual({
          access: 1,
          readDirectory: 1,
        });
      }
      expect(outcome.results).toEqual([allFound]);
    }),
  );

  it.effect("lists the conda package cache once for every package", () =>
    Effect.gen(function* () {
      const outcome = yield* readRecorded({
        env: { CONDA_PREFIX: "/conda" },
        files: Object.fromEntries(
          names.map((name) => [
            `/conda/pkgs/${name}-1.0.0/info/about.json`,
            JSON.stringify({ extra: { agentExtensions: [{ ref: `@acme/skills/${name}` }] } }),
          ]),
        ),
        packages: names.map((name) => detected("conda", name, "/project/environment.yml")),
      });
      expect(outcome.recording.counts("/conda/pkgs")).toEqual({ readDirectory: 1 });
      for (const name of names) {
        expect(
          outcome.recording.counts(`/conda/share/agent-extensions/${name}/agent-extensions.json`),
        ).toEqual({ readFile: 1 });
      }
      expect(outcome.results).toEqual([allFound]);
    }),
  );

  it.effect("reads no ecosystem root when no package of that ecosystem is detected", () =>
    Effect.gen(function* () {
      vi.stubEnv("HOME", "/home/user");
      const outcome = yield* readRecorded({
        env: {
          VIRTUAL_ENV: "/venv",
          CARGO_HOME: "/cargo",
          CONDA_PREFIX: "/conda",
          DENO_DIR: "/deno",
        },
        files: { "/project/.dart_tool/package_config.json": "{}" },
        packages: [detected("npm", "react", "/project/package.json")],
      });
      expect(outcome.recording.calls()).toEqual([]);
      expect(outcome.results).toEqual([[]]);
    }),
  );

  it.effect("keeps nothing shared beyond one read", () =>
    Effect.gen(function* () {
      const outcome = yield* readRecorded({
        env: { CARGO_HOME: "/cargo" },
        files: {},
        packages: names.map((name) => detected("cargo", name, "/project/Cargo.toml")),
        calls: 2,
      });
      expect(outcome.recording.counts("/cargo/registry/src")).toEqual({ readDirectory: 2 });
      expect(outcome.results).toEqual([[], []]);
    }),
  );
});

describe("a prepared package read", () => {
  it.effect("still serves a package whose sibling was interrupted during the shared listing", () =>
    Effect.gen(function* () {
      const memory = makeMemoryFileSystem();
      const index = "/cargo/registry/src/index.crates.io";
      for (const name of names) {
        yield* memory.fileSystem.makeDirectory(`${index}/${name}-1.0.0`, { recursive: true });
        yield* memory.fileSystem.writeFileString(
          `${index}/${name}-1.0.0/Cargo.toml`,
          `[package]\nname = "${name}"\n\n[package.metadata]\nagentExtensions = [{ ref = "@acme/skills/${name}" }]\n`,
        );
      }
      const recorder = makeRecordingFileSystem(memory.fileSystem);
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const gated: FileSystem.FileSystem = {
        ...recorder.fileSystem,
        readDirectory: (path, options) =>
          path === "/cargo/registry/src"
            ? Deferred.succeed(entered, undefined).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.andThen(recorder.fileSystem.readDirectory(path, options)),
              )
            : recorder.fileSystem.readDirectory(path, options),
      };
      const prepare = cargoReader.prepare;
      if (prepare === undefined) return yield* Effect.die("cargo reads share their roots");
      const read = yield* prepare;
      const [first, second] = names;
      const outcome = yield* Effect.gen(function* () {
        const interrupted = yield* Effect.forkChild(
          read(detected("cargo", first, "/project/Cargo.toml")),
          { startImmediately: true },
        );
        yield* Deferred.await(entered);
        const sibling = yield* Effect.forkChild(
          read(detected("cargo", second, "/project/Cargo.toml")),
          { startImmediately: true },
        );
        yield* Fiber.interrupt(interrupted);
        yield* Deferred.succeed(release, undefined);
        return {
          interrupted: yield* Fiber.await(interrupted),
          sibling: yield* Fiber.join(sibling),
        };
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(FileSystem.FileSystem, gated),
            Path.layer,
            ConfigProvider.layer(ConfigProvider.fromEnv({ env: { CARGO_HOME: "/cargo" } })),
          ),
        ),
      );
      expect(Exit.hasInterrupts(outcome.interrupted)).toBe(true);
      expect(Option.map(outcome.sibling, (refs) => refs.map((entry) => entry.ref))).toEqual(
        Option.some([`@acme/skills/${second}`]),
      );
      expect(recorder.recording.counts("/cargo/registry/src")).toEqual({ readDirectory: 1 });
    }).pipe(withoutNativeIo),
  );

  it.effect("fails every package with the one configuration failure, probing nothing", () =>
    Effect.gen(function* () {
      const memory = makeMemoryFileSystem();
      const recorder = makeRecordingFileSystem(memory.fileSystem);
      const sourceError = new ConfigProvider.SourceError({ message: "configuration unavailable" });
      const prepare = pypiReader.prepare;
      if (prepare === undefined) return yield* Effect.die("pypi reads share their roots");
      const read = yield* prepare;
      const failures = yield* Effect.forEach(
        names,
        (name) => Effect.flip(read(detected("pypi", name, "/project/requirements.txt"))),
        { concurrency: "unbounded" },
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(FileSystem.FileSystem, recorder.fileSystem),
            Path.layer,
            ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
          ),
        ),
      );
      expect(failures.map((failure) => failure.cause)).toEqual(names.map(() => sourceError));
      for (const failure of failures) expect(failure.cause).toBe(sourceError);
      expect(recorder.recording.calls()).toEqual([]);
    }).pipe(withoutNativeIo),
  );
});
