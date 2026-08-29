import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { cranDetector, cranReader } from "./cran.js";

const cranType = Schema.decodeUnknownSync(PackageTypeSchema)("cran");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write DESCRIPTION file, run detector, clean up. */
const detectInTempDir = (description?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (description !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "DESCRIPTION"), description);
    }
    return yield* cranDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("cranDetector", () => {
  it("has type cran", () => {
    expect(cranDetector.type).toBe(cranType);
  });

  describe("Depends field", () => {
    it.effect("extracts packages from Depends field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = [
            "Package: mypackage",
            "Version: 1.0.0",
            "Depends: R (>= 4.0), dplyr, ggplot2",
          ].join("\n");
          const result = yield* detectInTempDir(desc);
          // R itself is filtered out
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("dplyr");
          expect(names).toContain("ggplot2");
        }),
      ),
    );
  });

  describe("Imports field", () => {
    it.effect("extracts packages from Imports field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = ["Package: mypackage", "Version: 1.0.0", "Imports: tidyr, stringr"].join(
            "\n",
          );
          const result = yield* detectInTempDir(desc);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("tidyr");
          expect(names).toContain("stringr");
        }),
      ),
    );
  });

  describe("Suggests field", () => {
    it.effect("extracts packages from Suggests field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = ["Package: mypackage", "Version: 1.0.0", "Suggests: testthat, knitr"].join(
            "\n",
          );
          const result = yield* detectInTempDir(desc);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("testthat");
          expect(names).toContain("knitr");
        }),
      ),
    );
  });

  describe("all dependency fields combined", () => {
    it.effect("collects from Depends, Imports, and Suggests", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = [
            "Package: mypackage",
            "Version: 1.0.0",
            "Depends: R (>= 4.0), dplyr",
            "Imports: tidyr",
            "Suggests: testthat",
          ].join("\n");
          const result = yield* detectInTempDir(desc);
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("dplyr");
          expect(names).toContain("tidyr");
          expect(names).toContain("testthat");
        }),
      ),
    );
  });

  describe("continuation lines", () => {
    it.effect("handles continuation lines in DESCRIPTION", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = [
            "Package: mypackage",
            "Version: 1.0.0",
            "Imports: dplyr,",
            "    tidyr,",
            "    ggplot2",
          ].join("\n");
          const result = yield* detectInTempDir(desc);
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("dplyr");
          expect(names).toContain("tidyr");
          expect(names).toContain("ggplot2");
        }),
      ),
    );
  });

  describe("version constraints", () => {
    it.effect("packages with version constraints produce versionless purls", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = ["Package: mypackage", "Imports: dplyr (>= 1.0.0)"].join("\n");
          const result = yield* detectInTempDir(desc);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cran", name: "dplyr" }));
        }),
      ),
    );
  });

  describe("deduplication", () => {
    it.effect("deduplicates packages across fields", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = ["Package: mypackage", "Depends: dplyr", "Imports: dplyr"].join("\n");
          const result = yield* detectInTempDir(desc);
          expect(result).toHaveLength(1);
        }),
      ),
    );
  });

  describe("R filtered out", () => {
    it.effect("filters out R itself from Depends", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = "Package: mypackage\nDepends: R (>= 4.0)\n";
          const result = yield* detectInTempDir(desc);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("missing DESCRIPTION", () => {
    it.effect("returns empty array when DESCRIPTION is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependency fields", () => {
    it.effect("returns empty array when no dependency fields exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const desc = "Package: mypackage\nVersion: 1.0.0\n";
          const result = yield* detectInTempDir(desc);
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// cran Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp R library for reader tests. */
const readInTempLib = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  descriptionContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const libPath = path.join(tmpDir, "R-lib");

    if (descriptionContent !== undefined) {
      const pkgDir = path.join(libPath, pkgPurl.name);
      yield* fs.makeDirectory(pkgDir, { recursive: true });
      yield* fs.writeFileString(path.join(pkgDir, "DESCRIPTION"), descriptionContent);
    }

    // Create a source directory
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "DESCRIPTION"), "Package: test\n");

    const detected = {
      purl: pkgPurl,
      type: cranType,
      source: path.join(sourceDir, "DESCRIPTION"),
    };

    const origLib = process.env["R_LIBS_USER"];
    process.env["R_LIBS_USER"] = libPath;
    return yield* cranReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origLib === undefined) {
            delete process.env["R_LIBS_USER"];
          } else {
            process.env["R_LIBS_USER"] = origLib;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("cranReader", () => {
  it("has type cran", () => {
    expect(cranReader.type).toBe(cranType);
  });

  describe("valid Config/axm field", () => {
    it.effect("extracts extensions from Config/axm", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cran", name: "dplyr" });
          const desc = [
            "Package: dplyr",
            "Version: 1.1.4",
            'Config/axm: {"extensions": [{"ref":"@tidyverse/skills/dplyr","versionRange":"^1.0.0"}]}',
          ].join("\n");
          const result = yield* readInTempLib(purl, desc);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@tidyverse/skills/dplyr", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );
  });

  describe("missing Config/axm field", () => {
    it.effect("returns Option.none when no Config/axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cran", name: "dplyr" });
          const desc = "Package: dplyr\nVersion: 1.1.4\n";
          const result = yield* readInTempLib(purl, desc);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing installed package", () => {
    it.effect("returns Option.none when package is not installed", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cran", name: "dplyr" });
          const result = yield* readInTempLib(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed Config/axm JSON", () => {
    it.effect("returns Option.none on malformed JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cran", name: "dplyr" });
          const desc = "Package: dplyr\nConfig/axm: {not valid json}\n";
          const result = yield* readInTempLib(purl, desc);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("invalid axm metadata structure", () => {
    it.effect("returns Option.none when axm metadata fails schema validation", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cran", name: "dplyr" });
          const desc = 'Package: dplyr\nConfig/axm: {"extensions": "not-an-array"}\n';
          const result = yield* readInTempLib(purl, desc);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
