import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { juliaDetector, juliaReader } from "./julia.js";

const juliaType = Schema.decodeUnknownSync(PackageTypeSchema)("julia");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write Project.toml, run detector, clean up. */
const detectInTempDir = (projectToml?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (projectToml !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "Project.toml"), projectToml);
    }
    return yield* juliaDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("juliaDetector", () => {
  it("has type julia", () => {
    expect(juliaDetector.type).toBe(juliaType);
  });

  describe("dependencies from deps section", () => {
    it.effect("extracts dependencies from [deps]", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = [
            'name = "MyProject"',
            'uuid = "12345678-1234-1234-1234-123456789abc"',
            "",
            "[deps]",
            'JSON = "682c06a0-de6a-54ab-a142-c8b1cf79cde6"',
            'HTTP = "cd3eb016-35fb-5094-929b-558a96fad6f3"',
          ].join("\n");
          const result = yield* detectInTempDir(toml);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("JSON");
          expect(names).toContain("HTTP");
        }),
      ),
    );
  });

  describe("all purls are versionless", () => {
    it.effect("dependency produces versionless purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = ["[deps]", 'JSON = "682c06a0-de6a-54ab-a142-c8b1cf79cde6"'].join("\n");
          const result = yield* detectInTempDir(toml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "julia", name: "JSON" }));
        }),
      ),
    );
  });

  describe("compat section does not add versions", () => {
    it.effect("compat section ignored for versioning", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = [
            "[deps]",
            'JSON = "682c06a0-de6a-54ab-a142-c8b1cf79cde6"',
            "",
            "[compat]",
            'JSON = "0.21"',
          ].join("\n");
          const result = yield* detectInTempDir(toml);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "julia", name: "JSON" }));
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );
  });

  describe("compat-only entries ignored", () => {
    it.effect("package in compat but not deps produces nothing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = ["[compat]", 'julia = "1.6"'].join("\n");
          const result = yield* detectInTempDir(toml);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("missing Project.toml", () => {
    it.effect("returns empty array when Project.toml is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no deps section", () => {
    it.effect("returns empty array when no [deps] section", () =>
      withNodeContext(
        Effect.gen(function* () {
          const toml = ['name = "MyProject"', 'uuid = "12345678-1234-1234-1234-123456789abc"'].join(
            "\n",
          );
          const result = yield* detectInTempDir(toml);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed Project.toml", () => {
    it.effect("returns empty array on malformed content", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{{{{ not valid TOML ????");
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// julia Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp Julia packages dir for reader tests. */
const readInTempJulia = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  projectTomlContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const pkgName = pkgPurl.name;

    if (projectTomlContent !== undefined) {
      const pkgDir = path.join(tmpDir, ".julia", "packages", pkgName, "abcde");
      yield* fs.makeDirectory(pkgDir, { recursive: true });
      yield* fs.writeFileString(path.join(pkgDir, "Project.toml"), projectTomlContent);
    }

    // Override HOME for this test
    const origHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;

    const detected = {
      purl: pkgPurl,
      type: juliaType,
      source: path.join(tmpDir, "project", "Project.toml"),
    };
    return yield* juliaReader.read(detected).pipe(
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

describe("juliaReader", () => {
  it("has type julia", () => {
    expect(juliaReader.type).toBe(juliaType);
  });

  describe("valid [axm] section", () => {
    it.effect("extracts extensions from [axm] section", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "julia", name: "DataFrames" });
          const toml = [
            'name = "DataFrames"',
            "",
            "[axm]",
            'extensions = [{ ref = "@julialang/skills/dataframes", versionRange = "^1.0.0" }]',
          ].join("\n");
          const result = yield* readInTempJulia(purl, toml);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@julialang/skills/dataframes", versionRange: "^1.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "julia", name: "SomeLib" });
          const toml = ['name = "SomeLib"', "", "[axm]", "extensions = []"].join("\n");
          const result = yield* readInTempJulia(purl, toml);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing [axm] section", () => {
    it.effect("returns Option.none when no [axm] section", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "julia", name: "Plots" });
          const toml = ['name = "Plots"', 'uuid = "91a5bcdd-55d7-5caf-9e0b-520d859cae80"'].join(
            "\n",
          );
          const result = yield* readInTempJulia(purl, toml);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed [axm] section", () => {
    it.effect("returns Option.none on invalid metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "julia", name: "SomeLib" });
          const toml = ['name = "SomeLib"', "", "[axm]", 'extensions = "not-an-array"'].join("\n");
          const result = yield* readInTempJulia(purl, toml);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores unknown fields in [axm]", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "julia", name: "SomeLib" });
          const toml = [
            'name = "SomeLib"',
            "",
            "[axm]",
            'extensions = [{ ref = "@acme/skills/foo", versionRange = "^1.0.0" }]',
            "futureField = true",
          ].join("\n");
          const result = yield* readInTempJulia(purl, toml);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing Julia packages directory", () => {
    it.effect("returns Option.none when packages dir does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "julia", name: "NonExistent" });
          const result = yield* readInTempJulia(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
