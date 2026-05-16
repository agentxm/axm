import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { cpanDetector, cpanReader } from "./cpan.js";

const cpanType = Schema.decodeUnknownSync(PackageTypeSchema)("cpan");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write cpan files, run detector, clean up. */
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
    return yield* cpanDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("cpanDetector", () => {
  it("has type cpan", () => {
    expect(cpanDetector.type).toBe(cpanType);
  });

  describe("cpanfile parsing", () => {
    it.effect("extracts requires from cpanfile", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = [
            "requires 'Moose', '2.2014';",
            "requires 'DBI';",
            "requires 'JSON::XS', '3.04';",
          ].join("\n");
          const result = yield* detectInTempDir({ cpanfile: content });
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("Moose");
          expect(names).toContain("DBI");
          expect(names).toContain("JSON-XS");
        }),
      ),
    );

    it.effect("converts :: to - in module names", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = "requires 'Moose::Util::TypeConstraints';";
          const result = yield* detectInTempDir({ cpanfile: content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("Moose-Util-TypeConstraints");
        }),
      ),
    );

    it.effect("exact version included in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = "requires 'Moose', '2.2014';";
          const result = yield* detectInTempDir({ cpanfile: content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "cpan", name: "Moose", version: "2.2014" }),
          );
        }),
      ),
    );

    it.effect("versionless requires produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = "requires 'DBI';";
          const result = yield* detectInTempDir({ cpanfile: content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cpan", name: "DBI" }));
        }),
      ),
    );

    it.effect("handles double-quoted strings", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = 'requires "Moose", "2.2014";';
          const result = yield* detectInTempDir({ cpanfile: content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("Moose");
        }),
      ),
    );
  });

  describe("Makefile.PL PREREQ_PM", () => {
    it.effect("extracts dependencies from PREREQ_PM", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = [
            "use ExtUtils::MakeMaker;",
            "WriteMakefile(",
            "    NAME => 'My::Module',",
            "    PREREQ_PM => {",
            "        'Moose' => '2.2014',",
            "        'DBI' => '0',",
            "    },",
            ");",
          ].join("\n");
          const result = yield* detectInTempDir({ "Makefile.PL": content });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("Moose");
          expect(names).toContain("DBI");
        }),
      ),
    );

    it.effect("version 0 treated as versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = [
            "WriteMakefile(",
            "    PREREQ_PM => {",
            "        'DBI' => 0,",
            "    },",
            ");",
          ].join("\n");
          const result = yield* detectInTempDir({ "Makefile.PL": content });
          expect(result).toHaveLength(1);
          // "0" is a valid version string per our regex
          expect(result[0]?.purl.name).toBe("DBI");
        }),
      ),
    );

    it.effect("converts :: to - in Makefile.PL module names", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = [
            "WriteMakefile(",
            "    PREREQ_PM => {",
            "        'JSON::XS' => '3.04',",
            "    },",
            ");",
          ].join("\n");
          const result = yield* detectInTempDir({ "Makefile.PL": content });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("JSON-XS");
        }),
      ),
    );
  });

  describe("deduplication across files", () => {
    it.effect("deduplicates packages found in both cpanfile and Makefile.PL", () =>
      withNodeContext(
        Effect.gen(function* () {
          const cpanfile = "requires 'Moose', '2.2014';";
          const makefile = [
            "WriteMakefile(",
            "    PREREQ_PM => {",
            "        'Moose' => '2.2014',",
            "    },",
            ");",
          ].join("\n");
          const result = yield* detectInTempDir({
            cpanfile,
            "Makefile.PL": makefile,
          });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("Moose");
        }),
      ),
    );
  });

  describe("missing files", () => {
    it.effect("returns empty array when no cpan files exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed content", () => {
    it.effect("returns empty array for cpanfile without requires", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = "# just a comment\n";
          const result = yield* detectInTempDir({ cpanfile: content });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("returns empty array for Makefile.PL without PREREQ_PM", () =>
      withNodeContext(
        Effect.gen(function* () {
          const content = "use ExtUtils::MakeMaker;\nWriteMakefile(NAME => 'My::Module');\n";
          const result = yield* detectInTempDir({ "Makefile.PL": content });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// cpan Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp Perl lib for reader tests. */
const readInTempLib = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  mymetaContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const libPath = path.join(tmpDir, "perl5");

    if (mymetaContent !== undefined) {
      const distName = pkgPurl.name;
      const version = pkgPurl.version;
      const metaDir = version !== undefined ? `${distName}-${version}` : distName;
      const metaDirPath = path.join(libPath, ".meta", metaDir);
      yield* fs.makeDirectory(metaDirPath, { recursive: true });
      yield* fs.writeFileString(path.join(metaDirPath, "MYMETA.json"), mymetaContent);
    }

    // Create a source directory
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "cpanfile"), "");

    const detected = {
      purl: pkgPurl,
      type: cpanType,
      source: path.join(sourceDir, "cpanfile"),
    };

    const origLib = process.env["PERL5LIB"];
    process.env["PERL5LIB"] = libPath;
    return yield* cpanReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origLib === undefined) {
            delete process.env["PERL5LIB"];
          } else {
            process.env["PERL5LIB"] = origLib;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("cpanReader", () => {
  it("has type cpan", () => {
    expect(cpanReader.type).toBe(cpanType);
  });

  describe("valid x_axm in MYMETA.json", () => {
    it.effect("extracts extensions from x_axm", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cpan", name: "Moose", version: "2.2014" });
          const mymeta = JSON.stringify({
            name: "Moose",
            version: "2.2014",
            x_axm: {
              extensions: [{ ref: "@perl/skills/moose", versionRange: "^1.0.0" }],
            },
          });
          const result = yield* readInTempLib(purl, mymeta);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@perl/skills/moose", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cpan", name: "DBI", version: "1.643" });
          const mymeta = JSON.stringify({
            name: "DBI",
            x_axm: { extensions: [] },
          });
          const result = yield* readInTempLib(purl, mymeta);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing x_axm field", () => {
    it.effect("returns Option.none when no x_axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cpan", name: "Moose", version: "2.2014" });
          const mymeta = JSON.stringify({ name: "Moose", version: "2.2014" });
          const result = yield* readInTempLib(purl, mymeta);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing MYMETA.json", () => {
    it.effect("returns Option.none when MYMETA.json does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cpan", name: "Moose", version: "2.2014" });
          const result = yield* readInTempLib(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed MYMETA.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cpan", name: "Moose", version: "2.2014" });
          const result = yield* readInTempLib(purl, "{ not valid json }");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("invalid x_axm metadata", () => {
    it.effect("returns Option.none when x_axm fails schema validation", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cpan", name: "Moose", version: "2.2014" });
          const mymeta = JSON.stringify({
            name: "Moose",
            x_axm: { extensions: "not-an-array" },
          });
          const result = yield* readInTempLib(purl, mymeta);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in x_axm", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cpan", name: "Moose", version: "2.2014" });
          const mymeta = JSON.stringify({
            name: "Moose",
            x_axm: {
              extensions: [{ ref: "@perl/skills/moose", versionRange: "^1.0.0" }],
              futureField: true,
            },
          });
          const result = yield* readInTempLib(purl, mymeta);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@perl/skills/moose", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });
});
