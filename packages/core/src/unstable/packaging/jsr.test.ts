import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { Scope } from "effect/Scope";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { jsrDetector, denoReader } from "./jsr.js";

const genericType = Schema.decodeUnknownSync(PackageTypeSchema)("generic");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope>,
) => effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write deno.json or deno.jsonc, run detector, clean up. */
const detectInTempDir = (denoJson?: string, filename = "deno.json") =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (denoJson !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, filename), denoJson);
    }
    return yield* jsrDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("jsrDetector", () => {
  it("has type generic", () => {
    expect(jsrDetector.type).toBe(genericType);
  });

  describe("JSR imports extracted from deno.json", () => {
    it.effect("extracts jsr: imports", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJson = JSON.stringify({
            imports: {
              "@std/fs": "jsr:@std/fs@^1.0.0",
              "@std/path": "jsr:@std/path@1.0.0",
            },
          });
          const result = yield* detectInTempDir(denoJson);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("fs");
          expect(names).toContain("path");
        }),
      ),
    );
  });

  describe("npm imports skipped", () => {
    it.effect("skips npm: prefixed imports", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJson = JSON.stringify({
            imports: {
              lodash: "npm:lodash@^4.17.0",
              "@std/fs": "jsr:@std/fs@^1.0.0",
            },
          });
          const result = yield* detectInTempDir(denoJson);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("fs");
        }),
      ),
    );
  });

  describe("exact version produces versioned purl", () => {
    it.effect("exact version included in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJson = JSON.stringify({
            imports: {
              "@std/path": "jsr:@std/path@1.0.0",
            },
          });
          const result = yield* detectInTempDir(denoJson);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "generic",
              namespace: "jsr/@std",
              name: "path",
              version: "1.0.0",
            }),
          );
        }),
      ),
    );
  });

  describe("semver range produces versionless purl", () => {
    it.effect("caret range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJson = JSON.stringify({
            imports: {
              "@std/fs": "jsr:@std/fs@^1.0.0",
            },
          });
          const result = yield* detectInTempDir(denoJson);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "generic",
              namespace: "jsr/@std",
              name: "fs",
            }),
          );
        }),
      ),
    );
  });

  describe("scoped JSR packages use percent-encoded namespace", () => {
    it.effect("scope is percent-encoded in purl namespace", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJson = JSON.stringify({
            imports: {
              "@std/fs": "jsr:@std/fs@^1.0.0",
            },
          });
          const result = yield* detectInTempDir(denoJson);
          expect(result).toHaveLength(1);
          // The namespace should contain jsr/@std
          expect(result[0]?.purl.namespace).toBe("jsr/@std");
          expect(result[0]?.purl.name).toBe("fs");
        }),
      ),
    );
  });

  describe("missing deno.json and deno.jsonc", () => {
    it.effect("returns empty array when neither file exists", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed deno.json", () => {
    it.effect("returns empty array on malformed JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{ not valid json }");
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no imports map", () => {
    it.effect("returns empty array when no imports field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJson = JSON.stringify({ compilerOptions: { strict: true } });
          const result = yield* detectInTempDir(denoJson);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("deno.jsonc with comments", () => {
    it.effect("parses deno.jsonc with single-line comments", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJsonc = `{
  // This is a comment
  "imports": {
    "@std/fs": "jsr:@std/fs@^1.0.0" // inline comment
  }
}`;
          const result = yield* detectInTempDir(denoJsonc, "deno.jsonc");
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("fs");
        }),
      ),
    );

    it.effect("parses deno.jsonc with multi-line comments", () =>
      withNodeContext(
        Effect.gen(function* () {
          const denoJsonc = `{
  /* Multi-line
     comment */
  "imports": {
    "@std/path": "jsr:@std/path@1.0.0"
  }
}`;
          const result = yield* detectInTempDir(denoJsonc, "deno.jsonc");
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("path");
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Deno Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp Deno cache with axm metadata for reader tests. */
const readInTempDenoCache = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  denoJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Set up a fake Deno cache structure
    if (denoJsonContent !== undefined) {
      // Extract scope from namespace (e.g., "jsr/@std" -> "@std")
      const namespace = pkgPurl.namespace ?? "";
      const jsrPrefix = "jsr/";
      const scope = namespace.startsWith(jsrPrefix)
        ? namespace.slice(jsrPrefix.length).replace("%40", "@")
        : namespace;

      const pkgCacheDir = path.join(
        tmpDir,
        "deno-cache",
        "registries",
        "jsr.io",
        scope,
        pkgPurl.name,
        pkgPurl.version ?? "1.0.0",
      );
      yield* fs.makeDirectory(pkgCacheDir, { recursive: true });
      yield* fs.writeFileString(path.join(pkgCacheDir, "deno.json"), denoJsonContent);
    }

    // Create a source file
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "deno.json"), "{}");

    const detected = {
      purl: pkgPurl,
      type: genericType,
      source: path.join(sourceDir, "deno.json"),
    };

    // Override DENO_DIR for this test
    const origDenoDir = process.env["DENO_DIR"];
    process.env["DENO_DIR"] = path.join(tmpDir, "deno-cache");

    return yield* denoReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origDenoDir === undefined) {
            delete process.env["DENO_DIR"];
          } else {
            process.env["DENO_DIR"] = origDenoDir;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("denoReader", () => {
  it("has type generic", () => {
    expect(denoReader.type).toBe(genericType);
  });

  describe("valid axm metadata in cache", () => {
    it.effect("extracts recommendedExtensions from axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "jsr/@std",
            name: "fs",
            version: "1.0.0",
          });
          const result = yield* readInTempDenoCache(
            purl,
            JSON.stringify({
              name: "@std/fs",
              axm: {
                recommendedExtensions: ["@deno/skills/fs@^1.0.0"],
              },
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@deno/skills/fs@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("missing axm field", () => {
    it.effect("returns Option.none when no axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "jsr/@std",
            name: "fs",
            version: "1.0.0",
          });
          const result = yield* readInTempDenoCache(
            purl,
            JSON.stringify({ name: "@std/fs", version: "1.0.0" }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm metadata", () => {
    it.effect("returns Option.none on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "jsr/@std",
            name: "fs",
            version: "1.0.0",
          });
          const result = yield* readInTempDenoCache(
            purl,
            JSON.stringify({
              name: "@std/fs",
              axm: { recommendedExtensions: 42 },
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
          const purl = makePurl({
            type: "generic",
            namespace: "jsr/@std",
            name: "fs",
            version: "1.0.0",
          });
          const result = yield* readInTempDenoCache(
            purl,
            JSON.stringify({
              name: "@std/fs",
              axm: {
                recommendedExtensions: ["@acme/skills/foo@^1.0.0"],
                futureField: true,
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

  describe("missing Deno cache", () => {
    it.effect("returns Option.none when Deno cache does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "jsr/@std",
            name: "fs",
          });
          const result = yield* readInTempDenoCache(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("non-jsr namespace", () => {
    it.effect("returns Option.none for non-jsr namespace", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "zig",
            name: "zap",
          });
          // Override DENO_DIR to a temp dir that exists
          const fs = yield* FileSystem.FileSystem;
          const tmpDir = yield* fs.makeTempDirectoryScoped();
          const origDenoDir = process.env["DENO_DIR"];
          process.env["DENO_DIR"] = tmpDir;

          const detected = {
            purl,
            type: genericType,
            source: "/tmp/fake/deno.json",
          };

          const result = yield* denoReader.read(detected).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (origDenoDir === undefined) {
                  delete process.env["DENO_DIR"];
                } else {
                  process.env["DENO_DIR"] = origDenoDir;
                }
              }),
            ),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
