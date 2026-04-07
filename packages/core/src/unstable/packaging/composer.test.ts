import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { composerDetector, composerReader } from "./composer.js";

const composerType = Schema.decodeUnknownSync(PackageTypeSchema)("composer");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write composer.json, run detector, clean up. */
const detectInTempDir = (composerJson?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (composerJson !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "composer.json"), composerJson);
    }
    return yield* composerDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("composerDetector", () => {
  it("has type composer", () => {
    expect(composerDetector.type).toBe(composerType);
  });

  describe("dependencies from require and require-dev", () => {
    it.effect("extracts from require and require-dev", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({
              require: { "laravel/framework": "^10.0" },
              "require-dev": { "phpunit/phpunit": "^10.0" },
            }),
          );
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("framework");
          expect(names).toContain("phpunit");
        }),
      ),
    );
  });

  describe("vendor namespace and name extraction", () => {
    it.effect("standard vendor/name package", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ require: { "laravel/framework": "^10.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "composer", namespace: "laravel", name: "framework" }),
          );
        }),
      ),
    );

    it.effect("uppercase vendor normalized to lowercase", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ require: { "Monolog/Monolog": "^3.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.namespace).toBe("monolog");
          expect(result[0]?.purl.name).toBe("monolog");
        }),
      ),
    );
  });

  describe("exact versions produce versioned purls", () => {
    it.effect("exact version includes version in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ require: { "guzzlehttp/guzzle": "7.5.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "composer",
              namespace: "guzzlehttp",
              name: "guzzle",
              version: "7.5.0",
            }),
          );
        }),
      ),
    );
  });

  describe("semver ranges produce versionless purls", () => {
    it.effect("caret range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ require: { "guzzlehttp/guzzle": "^7.5.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "composer", namespace: "guzzlehttp", name: "guzzle" }),
          );
        }),
      ),
    );

    it.effect("tilde range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ require: { "monolog/monolog": "~3.0" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "composer", namespace: "monolog", name: "monolog" }),
          );
        }),
      ),
    );

    it.effect("wildcard range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ require: { "doctrine/dbal": "3.*" } }),
          );
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "composer", namespace: "doctrine", name: "dbal" }),
          );
        }),
      ),
    );
  });

  describe("platform requirements skipped", () => {
    it.effect("php requirement skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(JSON.stringify({ require: { php: ">=8.1" } }));
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("ext-* requirement skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ require: { "ext-mbstring": "*", "ext-json": "*" } }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("missing composer.json", () => {
    it.effect("returns empty array when composer.json is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed JSON", () => {
    it.effect("returns empty array and warns on malformed JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{ not valid json }");
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependency sections", () => {
    it.effect("returns empty array when no dependency sections exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir(
            JSON.stringify({ name: "vendor/my-package", description: "A package" }),
          );
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// composer Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp project with vendor dir for reader tests. */
const readInTempDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  vendorComposerJson?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Write the root composer.json (source for the detected package)
    yield* fs.writeFileString(path.join(tmpDir, "composer.json"), "{}");

    if (vendorComposerJson !== undefined) {
      // Reconstruct the vendor path from purl
      const pkgPath = pkgPurl.namespace ? `${pkgPurl.namespace}/${pkgPurl.name}` : pkgPurl.name;
      const pkgDir = path.join(tmpDir, "vendor", pkgPath);
      yield* fs.makeDirectory(pkgDir, { recursive: true });
      yield* fs.writeFileString(path.join(pkgDir, "composer.json"), vendorComposerJson);
    }

    const detected = {
      purl: pkgPurl,
      type: composerType,
      source: path.join(tmpDir, "composer.json"),
    };
    return yield* composerReader.read(detected);
  }).pipe(Effect.scoped);

describe("composerReader", () => {
  it("has type composer", () => {
    expect(composerReader.type).toBe(composerType);
  });

  describe("valid axm metadata in extra field", () => {
    it.effect("extracts recommendedExtensions from extra.axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "composer", namespace: "laravel", name: "framework" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "laravel/framework",
              extra: {
                axm: {
                  recommendedExtensions: ["@laravel/skills/framework@^1.0.0"],
                },
              },
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@laravel/skills/framework@^1.0.0"]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty recommendedExtensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "composer", namespace: "phpstan", name: "phpstan" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "phpstan/phpstan",
              extra: { axm: { recommendedExtensions: [] } },
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing extra.axm field", () => {
    it.effect("returns Option.none when no extra field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "composer", namespace: "monolog", name: "monolog" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({ name: "monolog/monolog", version: "3.0.0" }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );

    it.effect("returns Option.none when extra exists but no axm", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "composer", namespace: "monolog", name: "monolog" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "monolog/monolog",
              extra: { "some-other-key": true },
            }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed metadata", () => {
    it.effect("returns Option.none and warns on malformed axm metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "composer", namespace: "some", name: "lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some/lib",
              extra: { axm: { recommendedExtensions: "not-an-array" } },
            }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "composer", namespace: "some", name: "lib" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              name: "some/lib",
              extra: {
                axm: {
                  recommendedExtensions: ["@acme/skills/foo@^1.0.0"],
                  futureField: true,
                },
              },
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@acme/skills/foo@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("missing vendor directory", () => {
    it.effect("returns Option.none when vendor does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "composer", namespace: "laravel", name: "framework" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
