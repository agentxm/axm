import { withPackagingContext } from "./test-support/context.js";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";

import {
  composerDetector,
  golangDetector,
  mavenDetector,
  npmDetector,
  nugetDetector,
  packageDetectors,
} from "./index.js";

const manifestNames = [
  "package.json",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "Gemfile",
  "sample.gemspec",
  "pom.xml",
  "build.gradle",
  "sample.csproj",
  "composer.json",
  "Package.swift",
  "mix.exs",
  "pubspec.yaml",
  "Dockerfile",
  "Podfile",
  "environment.yml",
  "meta.yaml",
  "conanfile.txt",
  "DESCRIPTION",
  "cpanfile",
  "sample.cabal",
  "Project.toml",
  "sample.rockspec",
  "sample.opam",
  "dune-project",
  "MODULE.bazel",
  "build.zig.zon",
  "deno.json",
  "jsr.json",
  "pixi.toml",
] as const;

describe("package detectors", () => {
  fastCheckIt.prop(
    { content: FastCheck.string({ maxLength: 300 }) },
    { numRuns: 50, seed: 0x41584d },
  )("never defect on arbitrary manifest content", ({ content }) =>
    // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
    Effect.runPromise(
      withPackagingContext(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "package-detectors-property-" });
          for (const manifest of manifestNames) {
            yield* fs.writeFileString(path.join(dir, manifest), content);
          }
          yield* Effect.forEach(packageDetectors, (detector) => detector.detect(dir), {
            concurrency: 8,
            discard: true,
          });
        }).pipe(Effect.scoped),
      ),
    ),
  );

  it.effect("ignores empty package identities across affected ecosystems", () =>
    withPackagingContext(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectoryScoped({ prefix: "package-detectors-empty-" });
        yield* fs.writeFileString(path.join(dir, "package.json"), '{"dependencies":{"":"1.0.0"}}');
        yield* fs.writeFileString(
          path.join(dir, "composer.json"),
          '{"require":{"vendor/":"1.0.0"}}',
        );
        yield* fs.writeFileString(
          path.join(dir, "go.mod"),
          "module example.com/project\nrequire / v1.0.0\n",
        );
        yield* fs.writeFileString(
          path.join(dir, "pom.xml"),
          "<project><dependencies><dependency><groupId>example</groupId><artifactId></artifactId><version>1.0.0</version></dependency></dependencies></project>",
        );
        yield* fs.writeFileString(
          path.join(dir, "sample.csproj"),
          '<Project><ItemGroup><PackageReference Include="" Version="1.0.0" /></ItemGroup></Project>',
        );

        const results = yield* Effect.forEach(
          [npmDetector, composerDetector, golangDetector, mavenDetector, nugetDetector],
          (detector) => detector.detect(dir),
        );
        expect(results.flat()).toEqual([]);
      }).pipe(Effect.scoped),
    ),
  );
});
