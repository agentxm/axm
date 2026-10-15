import * as ConfigProvider from "effect/ConfigProvider";
import { withPackagingContext } from "./test-support/context.js";
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
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
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
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no bazel_dep directives", () => {
    it.effect("returns empty array when no bazel_dep calls", () =>
      withPackagingContext(
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
  agentExtensionsJsonContent?: string,
  options: { readonly packagePresent?: boolean } = {},
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    const projectDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(projectDir, { recursive: true });
    yield* fs.writeFileString(path.join(projectDir, "MODULE.bazel"), 'module(name = "myproject")');
    const outputBase = path.join(tmpDir, "output_base");
    const externalDir = path.join(outputBase, "external", pkgPurl.name);
    if (options.packagePresent !== false) {
      yield* fs.makeDirectory(externalDir, { recursive: true });
      if (agentExtensionsJsonContent !== undefined) {
        yield* fs.writeFileString(
          path.join(externalDir, "agent-extensions.json"),
          agentExtensionsJsonContent,
        );
      }
    }
    return yield* bazelReader
      .read({
        purl: pkgPurl,
        type: bazelType,
        source: path.join(projectDir, "MODULE.bazel"),
      })
      .pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { BAZEL_OUTPUT_BASE: outputBase } })),
        ),
      );
  }).pipe(Effect.scoped);

describe("bazelReader", () => {
  it("has type bazel", () => {
    expect(bazelReader.type).toBe(bazelType);
  });

  describe("valid agent-extensions.json in external repository", () => {
    it.effect("extracts extensions from agent-extensions.json", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "com_google_protobuf" });
          const result = yield* readInTempBazel(
            purl,
            JSON.stringify({
              agentExtensions: [{ ref: "@google/skills/protobuf", versionRange: "^1.0.0" }],
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
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl, JSON.stringify({ agentExtensions: [] }));
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing agent-extensions.json", () => {
    it.effect("returns Option.none when agent-extensions.json does not exist", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed agent-extensions.json", () => {
    it.effect("returns Option.none on invalid metadata", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl, JSON.stringify({ agentExtensions: 42 }));
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in agent-extensions.json", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(
            purl,
            JSON.stringify({
              agentExtensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
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

  describe("malformed JSON in agent-extensions.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withPackagingContext(
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
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "bazel", name: "rules_go" });
          const result = yield* readInTempBazel(purl, undefined, { packagePresent: false });
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
