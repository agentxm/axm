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
import { conanDetector, conanReader } from "./conan.js";

const conanType = Schema.decodeUnknownSync(PackageTypeSchema)("conan");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

/** Create a temp dir, write conan files, run detector, clean up. */
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
    return yield* conanDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("conanDetector", () => {
  it("has type conan", () => {
    expect(conanDetector.type).toBe(conanType);
  });

  describe("conanfile.txt [requires] section", () => {
    it.effect("extracts dependencies from [requires] section", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = [
            "[requires]",
            "zlib/1.2.13",
            "openssl/3.1.0",
            "",
            "[generators]",
            "CMakeDeps",
          ].join("\n");
          const result = yield* detectInTempDir({ "conanfile.txt": content });
          expect(result).toHaveLength(2);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "conan", name: "zlib", version: "1.2.13" }),
          );
          expect(result[1]?.purl).toEqual(
            makePurl({ type: "conan", name: "openssl", version: "3.1.0" }),
          );
        }),
      ),
    );

    it.effect("handles user/channel suffix", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = ["[requires]", "boost/1.82.0@user/stable"].join("\n");
          const result = yield* detectInTempDir({ "conanfile.txt": content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "conan", name: "boost", version: "1.82.0" }),
          );
        }),
      ),
    );

    it.effect("skips comments and empty lines", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = ["[requires]", "# This is a comment", "", "zlib/1.2.13"].join("\n");
          const result = yield* detectInTempDir({ "conanfile.txt": content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("zlib");
        }),
      ),
    );

    it.effect("ignores other sections", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = ["[build_requires]", "cmake/3.22.6", "[requires]", "zlib/1.2.13"].join(
            "\n",
          );
          const result = yield* detectInTempDir({ "conanfile.txt": content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("zlib");
        }),
      ),
    );
  });

  describe("conanfile.py requires attribute", () => {
    it.effect("extracts from class-level requires", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = [
            "from conan import ConanFile",
            "",
            "class MyConan(ConanFile):",
            '    requires = "zlib/1.2.13", "openssl/3.1.0"',
          ].join("\n");
          const result = yield* detectInTempDir({ "conanfile.py": content });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("zlib");
          expect(names).toContain("openssl");
        }),
      ),
    );

    it.effect("extracts from self.requires()", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = [
            "from conan import ConanFile",
            "",
            "class MyConan(ConanFile):",
            "    def requirements(self):",
            '        self.requires("zlib/1.2.13")',
            '        self.requires("boost/1.82.0")',
          ].join("\n");
          const result = yield* detectInTempDir({ "conanfile.py": content });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("zlib");
          expect(names).toContain("boost");
        }),
      ),
    );

    it.effect("extracts from parenthesized tuple requires", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = [
            "class MyConan(ConanFile):",
            '    requires = ("zlib/1.2.13", "openssl/3.1.0")',
          ].join("\n");
          const result = yield* detectInTempDir({ "conanfile.py": content });
          expect(result).toHaveLength(2);
        }),
      ),
    );
  });

  describe("deduplication across files", () => {
    it.effect("deduplicates packages found in both conanfile.txt and conanfile.py", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const txt = "[requires]\nzlib/1.2.13";
          const py = 'requires = "zlib/1.2.13"';
          const result = yield* detectInTempDir({
            "conanfile.txt": txt,
            "conanfile.py": py,
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("zlib");
        }),
      ),
    );
  });

  describe("missing files", () => {
    it.effect("returns empty array when no conan files exist", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed content", () => {
    it.effect("returns empty array for conanfile.txt without [requires]", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = "[generators]\nCMakeDeps\n";
          const result = yield* detectInTempDir({ "conanfile.txt": content });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for conanfile.py without requires", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const content = "class MyConan(ConanFile):\n    pass\n";
          const result = yield* detectInTempDir({ "conanfile.py": content });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// conan Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp Conan cache for reader tests. */
const readInTempCache = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  conanDataYml?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const conanCache = path.join(tmpDir, "conan-cache");

    if (conanDataYml !== undefined) {
      const version = pkgPurl.version ?? "0.0.0";
      const exportDir = path.join(conanCache, "p", pkgPurl.name, version, "export");
      yield* fs.makeDirectory(exportDir, { recursive: true });
      yield* fs.writeFileString(path.join(exportDir, "conandata.yml"), conanDataYml);
    }

    // Create a source file for the detected package
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "conanfile.txt"), "[requires]\n");

    const detected = {
      purl: pkgPurl,
      type: conanType,
      source: path.join(sourceDir, "conanfile.txt"),
    };

    return yield* conanReader
      .read(detected)
      .pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { CONAN_USER_HOME: conanCache } })),
        ),
      );
  }).pipe(Effect.scoped);

describe("conanReader", () => {
  it("has type conan", () => {
    expect(conanReader.type).toBe(conanType);
  });

  describe("valid agentExtensions metadata in conandata.yml", () => {
    it.effect("extracts extensions from agentExtensions field", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conan", name: "zlib", version: "1.2.13" });
          const yml = [
            "agentExtensions:",
            '  - { ref: "@conan/skills/zlib", versionRange: "^1.0.0" }',
          ].join("\n");
          const result = yield* readInTempCache(purl, yml);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@conan/skills/zlib", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing conandata.yml", () => {
    it.effect("returns Option.none when conandata.yml does not exist", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conan", name: "zlib", version: "1.2.13" });
          const result = yield* readInTempCache(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("no agentExtensions field", () => {
    it.effect("returns Option.none when conandata.yml has no agentExtensions field", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conan", name: "zlib", version: "1.2.13" });
          const yml = "patches:\n  1.2.13: []\n";
          const result = yield* readInTempCache(purl, yml);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed metadata", () => {
    it.effect("returns Option.none on malformed agentExtensions metadata", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conan", name: "zlib", version: "1.2.13" });
          const yml = "agentExtensions: not-an-array\n";
          const result = yield* readInTempCache(purl, yml);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed YAML", () => {
    it.effect("returns Option.none on invalid YAML", () =>
      withPackagingContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conan", name: "zlib", version: "1.2.13" });
          const result = yield* readInTempCache(purl, "{{{{ not valid yaml");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
