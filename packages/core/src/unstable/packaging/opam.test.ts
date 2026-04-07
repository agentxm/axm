import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { opamDetector, opamReader } from "./opam.js";

const opamType = Schema.decodeUnknownSync(PackageTypeSchema)("opam");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write opam/dune files, run detector, clean up. */
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
    return yield* opamDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("opamDetector", () => {
  it("has type opam", () => {
    expect(opamDetector.type).toBe(opamType);
  });

  describe("dependencies from depends field", () => {
    it.effect("extracts dependencies from opam depends", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = [
            'opam-version: "2.0"',
            'name: "mylib"',
            "depends: [",
            '  "lwt" {>= "5.0"}',
            '  "cohttp"',
            '  "yojson"',
            "]",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("lwt");
          expect(names).toContain("cohttp");
          expect(names).toContain("yojson");
        }),
      ),
    );
  });

  describe("skip build tooling", () => {
    it.effect("ocaml excluded", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = [
            'opam-version: "2.0"',
            "depends: [",
            '  "ocaml" {>= "5.0"}',
            '  "lwt" {>= "5.0"}',
            "]",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("lwt");
        }),
      ),
    );

    it.effect("dune excluded", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = [
            'opam-version: "2.0"',
            "depends: [",
            '  "dune" {>= "3.0"}',
            '  "yojson"',
            "]",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("yojson");
        }),
      ),
    );

    it.effect("only build tooling returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = [
            'opam-version: "2.0"',
            "depends: [",
            '  "ocaml" {>= "5.0"}',
            '  "dune" {>= "3.0"}',
            "]",
          ].join("\n");
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("version constraints", () => {
    it.effect("version range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = ['opam-version: "2.0"', 'depends: [ "lwt" {>= "5.0"} ]'].join("\n");
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "opam", name: "lwt" }));
        }),
      ),
    );

    it.effect("exact version produces versioned purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = ['opam-version: "2.0"', 'depends: [ "lwt" {= "5.7.0"} ]'].join("\n");
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "opam", name: "lwt", version: "5.7.0" }),
          );
        }),
      ),
    );

    it.effect("no constraint is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = ['opam-version: "2.0"', 'depends: [ "yojson" ]'].join("\n");
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "opam", name: "yojson" }));
        }),
      ),
    );
  });

  describe("dune-project depends", () => {
    it.effect("extracts from dune-project depends s-expression", () =>
      withNodeContext(
        Effect.gen(function* () {
          const duneContent = [
            "(lang dune 3.0)",
            "(depends",
            "  (ocaml (>= 5.0))",
            "  (lwt (>= 5.0))",
            "  yojson)",
          ].join("\n");
          const result = yield* detectInTempDir({ "dune-project": duneContent });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("lwt");
          expect(names).toContain("yojson");
          // ocaml should be skipped
          expect(names).not.toContain("ocaml");
        }),
      ),
    );
  });

  describe("deduplication across sources", () => {
    it.effect("deduplicates between opam and dune-project", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = ['opam-version: "2.0"', 'depends: [ "lwt" {>= "5.0"} ]'].join("\n");
          const duneContent = ["(lang dune 3.0)", "(depends", "  (lwt (>= 5.0)))"].join("\n");
          const result = yield* detectInTempDir({
            "mylib.opam": opamContent,
            "dune-project": duneContent,
          });
          const lwtEntries = result.filter((r) => r.purl.name === "lwt");
          expect(lwtEntries).toHaveLength(1);
        }),
      ),
    );
  });

  describe("missing opam files", () => {
    it.effect("returns empty array when no opam files", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no depends field", () => {
    it.effect("returns empty array when no depends field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const opamContent = ['opam-version: "2.0"', 'name: "mylib"', 'version: "1.0.0"'].join(
            "\n",
          );
          const result = yield* detectInTempDir({ "mylib.opam": opamContent });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("missing dune-project", () => {
    it.effect("returns empty array when no dune-project", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// opam Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp opam switch for reader tests. */
const readInTempOpam = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  opamFileContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const pkgName = pkgPurl.name;

    if (opamFileContent !== undefined) {
      const switchDir = path.join(tmpDir, ".opam", "default", "lib", pkgName);
      yield* fs.makeDirectory(switchDir, { recursive: true });
      yield* fs.writeFileString(path.join(switchDir, "opam"), opamFileContent);
    }

    // Override HOME
    const origHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;

    const detected = {
      purl: pkgPurl,
      type: opamType,
      source: path.join(tmpDir, "project", "mylib.opam"),
    };
    return yield* opamReader.read(detected).pipe(
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
  }).pipe(Effect.scoped);

describe("opamReader", () => {
  it("has type opam", () => {
    expect(opamReader.type).toBe(opamType);
  });

  describe("valid x-axm fields", () => {
    it.effect("extracts recommendedExtensions from x-axm fields", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "opam", name: "lwt" });
          const opamContent = [
            'opam-version: "2.0"',
            'name: "lwt"',
            'x-axm-recommendedExtensions: ["@ocaml/skills/lwt@^1.0.0"]',
          ].join("\n");
          const result = yield* readInTempOpam(purl, opamContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@ocaml/skills/lwt@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("missing x-axm fields", () => {
    it.effect("returns Option.none when no x-axm fields", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "opam", name: "core" });
          const opamContent = ['opam-version: "2.0"', 'name: "core"'].join("\n");
          const result = yield* readInTempOpam(purl, opamContent);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed x-axm metadata", () => {
    it.effect("returns Option.none on invalid metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "opam", name: "lwt" });
          const opamContent = [
            'opam-version: "2.0"',
            "x-axm-recommendedExtensions: not-valid-json",
          ].join("\n");
          const result = yield* readInTempOpam(purl, opamContent);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra x-axm fields tolerated", () => {
    it.effect("ignores unknown x-axm fields", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "opam", name: "lwt" });
          const opamContent = [
            'opam-version: "2.0"',
            'x-axm-recommendedExtensions: ["@ocaml/skills/lwt@^1.0.0"]',
            "x-axm-futureField: true",
          ].join("\n");
          const result = yield* readInTempOpam(purl, opamContent);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@ocaml/skills/lwt@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("missing opam switch", () => {
    it.effect("returns Option.none when switch does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "opam", name: "lwt" });
          const result = yield* readInTempOpam(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
