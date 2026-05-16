import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { mojoDetector, mojoReader } from "./mojo.js";

const genericType = Schema.decodeUnknownSync(PackageTypeSchema)("generic");
const condaType = Schema.decodeUnknownSync(PackageTypeSchema)("conda");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write pixi.toml and/or mojoproject.toml, run detector, clean up. */
const detectInTempDir = (files?: { pixi?: string; mojoproject?: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (files?.pixi !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "pixi.toml"), files.pixi);
    }
    if (files?.mojoproject !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "mojoproject.toml"), files.mojoproject);
    }
    return yield* mojoDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("mojoDetector", () => {
  it("has type generic", () => {
    expect(mojoDetector.type).toBe(genericType);
  });

  describe("dependencies extracted from pixi.toml", () => {
    it.effect("extracts mojo and conda dependencies", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pixi = `[project]
name = "my-mojo-project"

[dependencies]
max = ">=24.6"
numpy = ">=1.26"
`;
          const result = yield* detectInTempDir({ pixi });
          expect(result).toHaveLength(2);

          // max should be mojo-specific (pkg:generic/mojo)
          const maxDep = result.find((r) => r.purl.name === "max");
          expect(maxDep).toBeDefined();
          expect(maxDep?.purl).toEqual(
            makePurl({ type: "generic", namespace: "mojo", name: "max" }),
          );

          // numpy should be conda (pkg:conda)
          const numpyDep = result.find((r) => r.purl.name === "numpy");
          expect(numpyDep).toBeDefined();
          expect(numpyDep?.purl).toEqual(makePurl({ type: "conda", name: "numpy" }));
        }),
      ),
    );
  });

  describe("mojoproject.toml fallback", () => {
    it.effect("uses mojoproject.toml when pixi.toml is absent", () =>
      withNodeContext(
        Effect.gen(function* () {
          const mojoproject = `[project]
name = "my-mojo-project"

[dependencies]
max = ">=24.6"
`;
          const result = yield* detectInTempDir({ mojoproject });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("max");
        }),
      ),
    );
  });

  describe("pixi.toml takes precedence", () => {
    it.effect("uses pixi.toml when both files exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pixi = `[dependencies]
max = ">=24.6"
`;
          const mojoproject = `[dependencies]
numpy = ">=1.26"
`;
          const result = yield* detectInTempDir({ pixi, mojoproject });
          expect(result).toHaveLength(1);
          // Should use pixi.toml (max), not mojoproject.toml (numpy)
          expect(result[0]?.purl.name).toBe("max");
        }),
      ),
    );
  });

  describe("mojo-specific vs conda packages", () => {
    it.effect("mojo-specific package produces pkg:generic/mojo purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pixi = `[dependencies]
max = ">=24.6"
`;
          const result = yield* detectInTempDir({ pixi });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "generic", namespace: "mojo", name: "max" }),
          );
          expect(result[0]?.type).toBe(genericType);
        }),
      ),
    );

    it.effect("conda package produces pkg:conda purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pixi = `[dependencies]
numpy = ">=1.26"
`;
          const result = yield* detectInTempDir({ pixi });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "conda", name: "numpy" }));
          expect(result[0]?.type).toBe(condaType);
        }),
      ),
    );
  });

  describe("exact version produces versioned purl", () => {
    it.effect("exact version included", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pixi = `[dependencies]
max = "24.6.0"
`;
          const result = yield* detectInTempDir({ pixi });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "generic", namespace: "mojo", name: "max", version: "24.6.0" }),
          );
        }),
      ),
    );
  });

  describe("version range produces versionless purl", () => {
    it.effect("range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pixi = `[dependencies]
max = ">=24.6"
`;
          const result = yield* detectInTempDir({ pixi });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );
  });

  describe("missing dependency files", () => {
    it.effect("returns empty array when no files exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed pixi.toml", () => {
    it.effect("returns empty array on malformed TOML", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({
            pixi: "{{{{ not valid toml ????",
          });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependencies section", () => {
    it.effect("returns empty array when no [dependencies]", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pixi = `[project]
name = "my-project"
`;
          const result = yield* detectInTempDir({ pixi });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Mojo Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp pixi environment cache for reader tests. */
const readInTempPixiCache = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    if (axmJsonContent !== undefined) {
      // Set up pixi environment cache structure
      const condaMetaDir = path.join(
        tmpDir,
        ".pixi",
        "envs",
        "default",
        "conda-meta",
        `${pkgPurl.name}-${pkgPurl.version ?? "24.6.0"}`,
      );
      yield* fs.makeDirectory(condaMetaDir, { recursive: true });
      yield* fs.writeFileString(path.join(condaMetaDir, "axm.json"), axmJsonContent);
    }

    // Write a source manifest in the project dir
    yield* fs.writeFileString(
      path.join(tmpDir, "pixi.toml"),
      `[dependencies]\n${pkgPurl.name} = ">=1.0"`,
    );

    const detected = {
      purl: pkgPurl,
      type: genericType,
      source: path.join(tmpDir, "pixi.toml"),
    };

    return yield* mojoReader.read(detected);
  }).pipe(Effect.scoped);

describe("mojoReader", () => {
  it("has type generic", () => {
    expect(mojoReader.type).toBe(genericType);
  });

  describe("valid axm.json in pixi environment", () => {
    it.effect("extracts extensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "mojo",
            name: "max",
            version: "24.6.0",
          });
          const result = yield* readInTempPixiCache(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@modular/skills/max", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@modular/skills/max", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing axm.json", () => {
    it.effect("returns Option.none when no axm.json exists", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "mojo",
            name: "max",
          });
          const result = yield* readInTempPixiCache(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm.json", () => {
    it.effect("returns Option.none on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "mojo",
            name: "max",
            version: "24.6.0",
          });
          const result = yield* readInTempPixiCache(
            purl,
            JSON.stringify({ extensions: "not-an-array" }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "mojo",
            name: "max",
            version: "24.6.0",
          });
          const result = yield* readInTempPixiCache(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
              futureField: true,
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing .pixi directory", () => {
    it.effect("returns Option.none when .pixi does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "mojo",
            name: "max",
          });
          const result = yield* readInTempPixiCache(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed JSON in axm.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "generic",
            namespace: "mojo",
            name: "max",
            version: "24.6.0",
          });
          const result = yield* readInTempPixiCache(purl, "{ not valid json }");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
