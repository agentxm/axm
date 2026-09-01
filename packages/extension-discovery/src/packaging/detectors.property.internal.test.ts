import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";

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

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("package detectors", () => {
  it.effect.prop(
    "never defect on arbitrary manifest content",
    { content: FastCheck.string({ maxLength: 300 }) },
    ({ content }) =>
      withNode(
        Effect.gen(function* () {
          const dir = mkdtempSync(nodePath.join(tmpdir(), "package-detectors-property-"));
          try {
            for (const manifest of manifestNames) {
              writeFileSync(nodePath.join(dir, manifest), content);
            }
            yield* Effect.forEach(packageDetectors, (detector) => detector.detect(dir), {
              concurrency: 8,
              discard: true,
            });
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }),
      ),
    { fastCheck: { numRuns: 50, seed: 0x41584d } },
  );

  it.effect("ignores empty package identities across affected ecosystems", () =>
    withNode(
      Effect.gen(function* () {
        const dir = mkdtempSync(nodePath.join(tmpdir(), "package-detectors-empty-"));
        try {
          writeFileSync(nodePath.join(dir, "package.json"), '{"dependencies":{"":"1.0.0"}}');
          writeFileSync(nodePath.join(dir, "composer.json"), '{"require":{"vendor/":"1.0.0"}}');
          writeFileSync(
            nodePath.join(dir, "go.mod"),
            "module example.com/project\nrequire / v1.0.0\n",
          );
          writeFileSync(
            nodePath.join(dir, "pom.xml"),
            "<project><dependencies><dependency><groupId>example</groupId><artifactId></artifactId><version>1.0.0</version></dependency></dependencies></project>",
          );
          writeFileSync(
            nodePath.join(dir, "sample.csproj"),
            '<Project><ItemGroup><PackageReference Include="" Version="1.0.0" /></ItemGroup></Project>',
          );

          const results = yield* Effect.forEach(
            [npmDetector, composerDetector, golangDetector, mavenDetector, nugetDetector],
            (detector) => detector.detect(dir),
          );
          expect(results.flat()).toEqual([]);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }),
    ),
  );
});
