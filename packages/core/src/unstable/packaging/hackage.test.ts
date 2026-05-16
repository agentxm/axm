import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { hackageDetector, hackageReader } from "./hackage.js";

const hackageType = Schema.decodeUnknownSync(PackageTypeSchema)("hackage");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write cabal/stack files, run detector, clean up. */
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
    return yield* hackageDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("hackageDetector", () => {
  it("has type hackage", () => {
    expect(hackageDetector.type).toBe(hackageType);
  });

  describe("dependencies from build-depends", () => {
    it.effect("extracts dependencies from build-depends", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cabalContent = [
            "cabal-version: 2.4",
            "name: myproject",
            "version: 0.1.0.0",
            "",
            "library",
            "  build-depends: base >=4.7 && <5, aeson >=2.0, text",
          ].join("\n");
          const result = yield* detectInTempDir({ "myproject.cabal": cabalContent });
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("base");
          expect(names).toContain("aeson");
          expect(names).toContain("text");
        }),
      ),
    );
  });

  describe("dependencies in library and executable sections", () => {
    it.effect("extracts from both sections", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cabalContent = [
            "cabal-version: 2.4",
            "name: myproject",
            "",
            "library",
            "  build-depends: aeson",
            "",
            "executable myapp",
            "  build-depends: optparse-applicative",
          ].join("\n");
          const result = yield* detectInTempDir({ "myproject.cabal": cabalContent });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("aeson");
          expect(names).toContain("optparse-applicative");
        }),
      ),
    );
  });

  describe("version constraints produce versionless purls", () => {
    it.effect("version range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cabalContent = [
            "name: myproject",
            "library",
            "  build-depends: aeson >=2.0 && <3",
          ].join("\n");
          const result = yield* detectInTempDir({ "myproject.cabal": cabalContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "hackage", name: "aeson" }));
        }),
      ),
    );

    it.effect("no version constraint is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cabalContent = ["name: myproject", "library", "  build-depends: text"].join("\n");
          const result = yield* detectInTempDir({ "myproject.cabal": cabalContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "hackage", name: "text" }));
        }),
      ),
    );
  });

  describe("exact version pin produces versioned purl", () => {
    it.effect("== pin includes version", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cabalContent = [
            "name: myproject",
            "library",
            "  build-depends: aeson ==2.1.0.0",
          ].join("\n");
          const result = yield* detectInTempDir({ "myproject.cabal": cabalContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "hackage", name: "aeson", version: "2.1.0.0" }),
          );
        }),
      ),
    );
  });

  describe("stack.yaml extra-deps", () => {
    it.effect("extracts from extra-deps list", () =>
      withNodeContext(
        Effect.gen(function* () {
          const stackYaml = [
            "resolver: lts-21.0",
            "extra-deps:",
            "  - aeson-2.1.0.0",
            "  - text-2.0.1",
          ].join("\n");
          const result = yield* detectInTempDir({ "stack.yaml": stackYaml });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("aeson");
          expect(names).toContain("text");
        }),
      ),
    );

    it.effect("extra-deps inline list", () =>
      withNodeContext(
        Effect.gen(function* () {
          const stackYaml = "resolver: lts-21.0\nextra-deps: [aeson-2.1.0.0, text-2.0.1]";
          const result = yield* detectInTempDir({ "stack.yaml": stackYaml });
          expect(result).toHaveLength(2);
        }),
      ),
    );

    it.effect("extra-deps version included in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const stackYaml = ["resolver: lts-21.0", "extra-deps:", "  - aeson-2.1.0.0"].join("\n");
          const result = yield* detectInTempDir({ "stack.yaml": stackYaml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "hackage", name: "aeson", version: "2.1.0.0" }),
          );
        }),
      ),
    );
  });

  describe("deduplication across sources", () => {
    it.effect("deduplicates when both cabal and stack.yaml list same package", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cabalContent = ["name: myproject", "library", "  build-depends: aeson"].join("\n");
          const stackYaml = ["resolver: lts-21.0", "extra-deps:", "  - aeson-2.1.0.0"].join("\n");
          const result = yield* detectInTempDir({
            "myproject.cabal": cabalContent,
            "stack.yaml": stackYaml,
          });
          // Should be deduplicated - cabal entry comes first
          const aesonEntries = result.filter((r) => r.purl.name === "aeson");
          expect(aesonEntries).toHaveLength(1);
        }),
      ),
    );
  });

  describe("missing cabal files", () => {
    it.effect("returns empty array when no cabal files", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no build-depends fields", () => {
    it.effect("returns empty array when cabal file has no build-depends", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cabalContent = ["cabal-version: 2.4", "name: myproject", "version: 0.1.0.0"].join(
            "\n",
          );
          const result = yield* detectInTempDir({ "myproject.cabal": cabalContent });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("missing stack.yaml", () => {
    it.effect("returns empty array when no stack.yaml", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no extra-deps", () => {
    it.effect("returns empty array when stack.yaml has no extra-deps", () =>
      withNodeContext(
        Effect.gen(function* () {
          const stackYaml = "resolver: lts-21.0\npackages:\n  - .";
          const result = yield* detectInTempDir({ "stack.yaml": stackYaml });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// hackage Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp Cabal store for reader tests. */
const readInTempCabalStore = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  cabalFileContent?: string,
  location?: "store" | "dist-newstyle",
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const pkgName = pkgPurl.name;
    const version = pkgPurl.version;

    if (cabalFileContent !== undefined) {
      if (location === "dist-newstyle") {
        // Set up dist-newstyle structure
        const projectDir = path.join(tmpDir, "project");
        yield* fs.makeDirectory(projectDir, { recursive: true });
        yield* fs.writeFileString(path.join(projectDir, "myproject.cabal"), "name: myproject");

        const pkgDirName = version ? `${pkgName}-${version}` : pkgName;
        const buildDir = path.join(projectDir, "dist-newstyle", "build", pkgDirName);
        yield* fs.makeDirectory(buildDir, { recursive: true });
        yield* fs.writeFileString(path.join(buildDir, `${pkgName}.cabal`), cabalFileContent);

        const detected = {
          purl: pkgPurl,
          type: hackageType,
          source: path.join(projectDir, "myproject.cabal"),
        };
        return yield* hackageReader.read(detected);
      }

      // Default: set up cabal store structure
      const storeDir = path.join(tmpDir, ".cabal", "store", "ghc-9.6.3");
      const pkgDirName = version ? `${pkgName}-${version}` : pkgName;
      const pkgDir = path.join(storeDir, pkgDirName);
      yield* fs.makeDirectory(pkgDir, { recursive: true });
      yield* fs.writeFileString(path.join(pkgDir, `${pkgName}.cabal`), cabalFileContent);

      // Override HOME for this test
      const origHome = process.env["HOME"];
      process.env["HOME"] = tmpDir;

      const detected = {
        purl: pkgPurl,
        type: hackageType,
        source: path.join(tmpDir, "project", "myproject.cabal"),
      };
      return yield* hackageReader.read(detected).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (origHome === undefined) {
              delete process.env["HOME"];
            } else {
              process.env["HOME"] = origHome;
            }
          }),
        ),
      );
    }

    const detected = {
      purl: pkgPurl,
      type: hackageType,
      source: path.join(tmpDir, "project", "myproject.cabal"),
    };
    return yield* hackageReader.read(detected);
  }).pipe(Effect.scoped);

describe("hackageReader", () => {
  it("has type hackage", () => {
    expect(hackageReader.type).toBe(hackageType);
  });

  describe("valid x-axm fields", () => {
    it.effect("extracts extensions from x-axm fields", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hackage", name: "aeson", version: "2.2.1.0" });
          const cabalContent = [
            "name: aeson",
            "version: 2.2.1.0",
            'x-axm-extensions: [{"ref":"@hackage/skills/aeson","versionRange":"^1.0.0"}]',
          ].join("\n");
          const result = yield* readInTempCabalStore(purl, cabalContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@hackage/skills/aeson", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );
  });

  describe("missing x-axm fields", () => {
    it.effect("returns Option.none when no x-axm fields", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hackage", name: "text", version: "2.0.1" });
          const cabalContent = ["name: text", "version: 2.0.1"].join("\n");
          const result = yield* readInTempCabalStore(purl, cabalContent);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed x-axm metadata", () => {
    it.effect("returns Option.none on invalid metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hackage", name: "aeson", version: "2.2.1.0" });
          const cabalContent = ["name: aeson", "x-axm-extensions: not-valid-json"].join("\n");
          const result = yield* readInTempCabalStore(purl, cabalContent);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra x-axm fields tolerated", () => {
    it.effect("ignores unknown x-axm fields", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hackage", name: "aeson", version: "2.2.1.0" });
          const cabalContent = [
            "name: aeson",
            'x-axm-extensions: [{"ref":"@hackage/skills/aeson","versionRange":"^1.0.0"}]',
            "x-axm-futureField: true",
          ].join("\n");
          const result = yield* readInTempCabalStore(purl, cabalContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@hackage/skills/aeson", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );
  });

  describe("dist-newstyle location", () => {
    it.effect("reads from dist-newstyle", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hackage", name: "aeson", version: "2.2.1.0" });
          const cabalContent = [
            "name: aeson",
            'x-axm-extensions: [{"ref":"@hackage/skills/aeson","versionRange":"^1.0.0"}]',
          ].join("\n");
          const result = yield* readInTempCabalStore(purl, cabalContent, "dist-newstyle");
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@hackage/skills/aeson", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );
  });

  describe("missing cabal store", () => {
    it.effect("returns Option.none when store does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "hackage", name: "aeson", version: "2.2.1.0" });
          const result = yield* readInTempCabalStore(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
