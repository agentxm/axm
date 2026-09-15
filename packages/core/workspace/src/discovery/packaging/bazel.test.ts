import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { bazelDetector, bazelReader } from "./bazel.js";

const bazelType = Schema.decodeUnknownSync(PackageTypeSchema)("bazel");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write MODULE.bazel, run detector, clean up. */
const detectInTempDir = (files?: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (files !== undefined) {
      for (const [name, content] of Object.entries(files)) {
        yield* fs.writeFileString(path.join(tmpDir, name), content);
      }
    }
    return yield* bazelDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("bazelDetector", () => {
  it("has type bazel", () => {
    expect(bazelDetector.type).toBe(bazelType);
  });

  describe("dependencies from bazel_dep", () => {
    it.effect("extracts from bazel_dep directives", () =>
      withNodeContext(
        Effect.gen(function* () {
          const moduleBazel = [
            'module(name = "myproject")',
            "",
            'bazel_dep(name = "rules_go", version = "0.41.0")',
            'bazel_dep(name = "gazelle", version = "0.33.0")',
          ].join("\n");
          const result = yield* detectInTempDir({ "MODULE.bazel": moduleBazel });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("rules_go");
          expect(names).toContain("gazelle");
        }),
      ),
    );
  });

  describe("versioned bazel_dep produces versioned purl", () => {
    it.effect("version attribute included", () =>
      withNodeContext(
        Effect.gen(function* () {
          const moduleBazel = 'bazel_dep(name = "rules_go", version = "0.41.0")';
          const result = yield* detectInTempDir({ "MODULE.bazel": moduleBazel });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "bazel", name: "rules_go", version: "0.41.0" }),
          );
        }),
      ),
    );
  });

  describe("bazel_dep without version", () => {
    it.effect("produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const moduleBazel = 'bazel_dep(name = "rules_go")';
          const result = yield* detectInTempDir({ "MODULE.bazel": moduleBazel });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "bazel", name: "rules_go" }));
        }),
      ),
    );
  });

  describe("missing MODULE.bazel", () => {
    it.effect("returns empty array when no MODULE.bazel", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no bazel_dep directives", () => {
    it.effect("returns empty array when no bazel_dep calls", () =>
      withNodeContext(
        Effect.gen(function* () {
          const moduleBazel = 'module(name = "myproject")';
          const result = yield* detectInTempDir({ "MODULE.bazel": moduleBazel });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// bazel Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp Bazel output base for reader tests. */
const readInTempBazel = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const pkgName = pkgPurl.name;

    // Set up project directory
    const projectDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(projectDir, { recursive: true });
    yield* fs.writeFileString(path.join(projectDir, "MODULE.bazel"), 'module(name = "myproject")');

    if (axmJsonContent !== undefined) {
      const outputBase = path.join(tmpDir, "output_base");
      const externalDir = path.join(outputBase, "external", pkgName);
      yield* fs.makeDirectory(externalDir, { recursive: true });
      yield* fs.writeFileString(path.join(externalDir, "axm.json"), axmJsonContent);

      // Set BAZEL_OUTPUT_BASE
      const origOutputBase = process.env["BAZEL_OUTPUT_BASE"];
      process.env["BAZEL_OUTPUT_BASE"] = outputBase;

      const detected = {
        purl: pkgPurl,
        type: bazelType,
        source: path.join(projectDir, "MODULE.bazel"),
      };
      return yield* bazelReader.read(detected).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (origOutputBase === undefined) {
              delete process.env["BAZEL_OUTPUT_BASE"];
            } else {
              process.env["BAZEL_OUTPUT_BASE"] = origOutputBase;
            }
          }),
        ),
      );
    }

    const detected = {
      purl: pkgPurl,
      type: bazelType,
      source: path.join(projectDir, "MODULE.bazel"),
    };
    return yield* bazelReader.read(detected);
  }).pipe(Effect.scoped);

describe("bazelReader", () => {
  it("has type bazel", () => {
    expect(bazelReader.type).toBe(bazelType);
  });

  describe("valid axm.json in external repository", () => {
    it.effect("extracts extensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "com_google_protobuf" });
          const result = yield* readInTempBazel(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@google/skills/protobuf", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@google/skills/protobuf", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl, JSON.stringify({ extensions: [] }));
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing axm.json", () => {
    it.effect("returns Option.none when axm.json does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm.json", () => {
    it.effect("returns Option.none on invalid metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl, JSON.stringify({ extensions: 42 }));
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(
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

  describe("malformed JSON in axm.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl, "{ not valid json }");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing output base", () => {
    it.effect("returns Option.none when output base does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
