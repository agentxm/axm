import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { detectPackages } from "./detect.js";
import { packageDetectors, npmDetector } from "./index.js";
import type { PackageDetector } from "./types.js";

const decodeType = Schema.decodeUnknownSync(PackageTypeSchema);

/** Manifests that only a listing of the project directory finds, one per listing detector. */
const listedManifests: Readonly<Record<string, string>> = {
  "x.gemspec": [
    "Gem::Specification.new do |spec|",
    '  spec.add_dependency "nokogiri", "~> 1.15"',
    "end",
  ].join("\n"),
  "a.csproj": [
    '<Project Sdk="Microsoft.NET.Sdk">',
    "  <ItemGroup>",
    '    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />',
    "  </ItemGroup>",
    "</Project>",
  ].join("\n"),
  "p.podspec": ["Pod::Spec.new do |s|", "  s.dependency 'Alamofire', '~> 5.0'", "end"].join("\n"),
  "h.cabal": ["cabal-version: 2.4", "name: h", "library", "  build-depends: aeson >=2.0"].join(
    "\n",
  ),
  "r.rockspec": ['package = "r"', "dependencies = {", '  "luasocket >= 3.0"', "}"].join("\n"),
  "o.opam": ['opam-version: "2.0"', "depends: [", '  "lwt"', "]"].join("\n"),
};

/** The manifest suffix each listing detector selects from the project directory. */
const listedSourceOf: Readonly<Record<string, string>> = {
  gem: "x.gemspec",
  nuget: "a.csproj",
  cocoapods: "p.podspec",
  hackage: "h.cabal",
  luarocks: "r.rockspec",
  opam: "o.opam",
};

const withProject = <A, E, R>(
  files: Readonly<Record<string, string>>,
  use: (projectDir: string) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-detect-listing-"));
      for (const [name, content] of Object.entries(files)) {
        nodeFs.writeFileSync(nodePath.join(root, name), content);
      }
      return root;
    }),
    use,
    (root) => Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
  );

/**
 * The live filesystem, except that the first listing of `projectDir` announces
 * itself through `started` and waits for `release` before it reads.
 */
const gateFirstListing = (
  base: FileSystem.FileSystem,
  projectDir: string,
  started: Deferred.Deferred<void>,
  release: Deferred.Deferred<void>,
): FileSystem.FileSystem => {
  let gated = true;
  return {
    ...base,
    readDirectory: (path, options) =>
      Effect.suspend(() => {
        if (path !== projectDir || !gated) return base.readDirectory(path, options);
        gated = false;
        return Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.andThen(base.readDirectory(path, options)),
        );
      }),
  };
};

/** Detect over the live filesystem, counting the listings of `projectDir` only. */
const detectRecorded = (
  projectDir: string,
  detectors: ReadonlyArray<PackageDetector>,
  wrap: (base: FileSystem.FileSystem) => FileSystem.FileSystem = (base) => base,
) =>
  Effect.gen(function* () {
    const recorder = makeRecordingFileSystem(wrap(yield* FileSystem.FileSystem));
    const result = yield* detectPackages(projectDir, detectors).pipe(
      Effect.provideService(FileSystem.FileSystem, recorder.fileSystem),
    );
    const listings = recorder.recording.calls({ method: "readDirectory", path: projectDir });
    return { result, listings: listings.map((call) => call.outcome) };
  });

describe("detectPackages project listing", () => {
  it.effect("lists the project directory once for every detector of one detection", () =>
    withProject(listedManifests, (projectDir) =>
      Effect.gen(function* () {
        const baseline = [];
        for (const detector of packageDetectors) {
          const alone = yield* detectPackages(projectDir, [detector]);
          const listed = listedSourceOf[detector.type];
          // Each manifest is selected by its own detector only.
          expect(alone.map((pkg) => nodePath.basename(pkg.source))).toEqual(
            listed === undefined ? [] : [listed],
          );
          baseline.push(...alone);
        }

        const { result, listings } = yield* detectRecorded(projectDir, packageDetectors);

        expect(listings).toEqual(["success"]);
        expect(result).toEqual(baseline);
        expect(result.map((pkg) => pkg.purl.name)).toEqual([
          "nokogiri",
          "newtonsoft.json",
          "Alamofire",
          "aeson",
          "luasocket",
          "lwt",
        ]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("lists an empty project directory once and detects nothing", () =>
    withProject({}, (projectDir) =>
      Effect.gen(function* () {
        const { result, listings } = yield* detectRecorded(projectDir, packageDetectors);
        expect(listings).toEqual(["success"]);
        expect(result).toEqual([]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("gives every detector the same absence for a project directory that is missing", () =>
    withProject({}, (root) =>
      Effect.gen(function* () {
        const projectDir = nodePath.join(root, "missing");
        const { result, listings } = yield* detectRecorded(projectDir, packageDetectors);
        expect(listings).toEqual(["failure"]);
        expect(result).toEqual([]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("gives every detector the same absence for a project path that is a file", () =>
    withProject({ "x.gemspec": listedManifests["x.gemspec"] ?? "" }, (root) =>
      Effect.gen(function* () {
        const projectDir = nodePath.join(root, "x.gemspec");
        const { result, listings } = yield* detectRecorded(projectDir, packageDetectors);
        expect(listings).toEqual(["failure"]);
        expect(result).toEqual([]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not list the project directory when no detector reads its listing", () =>
    withProject(listedManifests, (projectDir) =>
      Effect.gen(function* () {
        const none = yield* detectRecorded(projectDir, []);
        expect(none).toEqual({ result: [], listings: [] });
        const npmOnly = yield* detectRecorded(projectDir, [npmDetector]);
        expect(npmOnly).toEqual({ result: [], listings: [] });
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("gives a detector that asks after the listing finished the same entries", () =>
    withProject(listedManifests, (projectDir) =>
      Effect.gen(function* () {
        const listed = yield* Deferred.make<void>();
        let first: Option.Option<ReadonlyArray<string>> = Option.none();
        let later: Option.Option<ReadonlyArray<string>> = Option.none();
        const early: PackageDetector = {
          type: decodeType("gem"),
          detect: (_projectDir, projectEntries) =>
            Effect.gen(function* () {
              first = yield* projectEntries;
              yield* Deferred.succeed(listed, undefined);
              return [];
            }),
        };
        const late: PackageDetector = {
          type: decodeType("nuget"),
          detect: (_projectDir, projectEntries) =>
            Effect.gen(function* () {
              yield* Deferred.await(listed);
              later = yield* projectEntries;
              return [];
            }),
        };

        const { listings } = yield* detectRecorded(projectDir, [early, late]);

        expect(listings).toEqual(["success"]);
        expect(Option.map(first, (entries) => [...entries].sort())).toEqual(
          Option.some(Object.keys(listedManifests).sort()),
        );
        expect(Option.getOrUndefined(later)).toBe(Option.getOrUndefined(first));
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps one listing for a detector still waiting when another stops waiting", () =>
    withProject(listedManifests, (projectDir) =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const secondWaiting = yield* Deferred.make<void>();
        let seen: Option.Option<ReadonlyArray<string>> = Option.none();
        const abandoning: PackageDetector = {
          type: decodeType("gem"),
          detect: (_projectDir, projectEntries) =>
            Effect.gen(function* () {
              const waiting = yield* Effect.forkChild(projectEntries, { startImmediately: true });
              yield* Deferred.await(started);
              yield* Deferred.await(secondWaiting);
              yield* Fiber.interrupt(waiting);
              yield* Deferred.succeed(release, undefined);
              return [];
            }),
        };
        const waiting: PackageDetector = {
          type: decodeType("nuget"),
          detect: (_projectDir, projectEntries) =>
            Effect.gen(function* () {
              yield* Deferred.await(started);
              const listing = yield* Effect.forkChild(projectEntries, { startImmediately: true });
              yield* Deferred.succeed(secondWaiting, undefined);
              seen = yield* Fiber.join(listing);
              return [];
            }),
        };

        const { listings } = yield* detectRecorded(projectDir, [abandoning, waiting], (base) =>
          gateFirstListing(base, projectDir, started, release),
        );

        expect(listings).toEqual(["success"]);
        expect(Option.map(seen, (entries) => [...entries].sort())).toEqual(
          Option.some(Object.keys(listedManifests).sort()),
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("lists again for a later detector when every detector stopped waiting", () =>
    withProject(listedManifests, (projectDir) =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let seen: Option.Option<ReadonlyArray<string>> = Option.none();
        const abandoning: PackageDetector = {
          type: decodeType("gem"),
          detect: (_projectDir, projectEntries) =>
            Effect.gen(function* () {
              const waiting = yield* Effect.forkChild(projectEntries, { startImmediately: true });
              yield* Deferred.await(started);
              yield* Fiber.interrupt(waiting);
              seen = yield* projectEntries;
              return [];
            }),
        };

        const { listings } = yield* detectRecorded(projectDir, [abandoning], (base) =>
          gateFirstListing(base, projectDir, started, release),
        );

        expect(listings).toEqual(["interrupted", "success"]);
        expect(Option.map(seen, (entries) => [...entries].sort())).toEqual(
          Option.some(Object.keys(listedManifests).sort()),
        );
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
