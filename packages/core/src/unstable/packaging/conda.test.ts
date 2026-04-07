import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { condaDetector, condaReader } from "./conda.js";

const condaType = Schema.decodeUnknownSync(PackageTypeSchema)("conda");
const pypiType = Schema.decodeUnknownSync(PackageTypeSchema)("pypi");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write files, run detector, clean up. */
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
    return yield* condaDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("condaDetector", () => {
  it("has type conda", () => {
    expect(condaDetector.type).toBe(condaType);
  });

  describe("environment.yml dependencies", () => {
    it.effect("extracts dependencies from environment.yml", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = [
            "name: myenv",
            "dependencies:",
            "  - numpy=1.24.0",
            "  - pandas",
            "  - scikit-learn",
          ].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("numpy");
          expect(names).toContain("pandas");
          expect(names).toContain("scikit-learn");
        }),
      ),
    );

    it.effect("missing environment.yml returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({});
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("no dependencies section returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["name: myenv", "channels:", "  - defaults"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("meta.yaml dependencies", () => {
    it.effect("extracts from requirements host and run", () =>
      withNodeContext(
        Effect.gen(function* () {
          const metaYaml = [
            "package:",
            "  name: mypackage",
            "  version: 1.0.0",
            "",
            "requirements:",
            "  host:",
            "    - python",
            "    - numpy",
            "  run:",
            "    - python",
            "    - pandas",
          ].join("\n");
          const result = yield* detectInTempDir({ "meta.yaml": metaYaml });
          expect(result).toHaveLength(4);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("python");
          expect(names).toContain("numpy");
          expect(names).toContain("pandas");
        }),
      ),
    );

    it.effect("missing meta.yaml returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({});
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("version parsing", () => {
    it.effect("name with version and build", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - numpy=1.24.0=py311h54d7cd4_0"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "conda", name: "numpy", version: "1.24.0" }),
          );
        }),
      ),
    );

    it.effect("name with version only", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - pandas=2.0.0"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "conda", name: "pandas", version: "2.0.0" }),
          );
        }),
      ),
    );

    it.effect("name only is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - scikit-learn"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "conda", name: "scikit-learn" }));
        }),
      ),
    );
  });

  describe("exact versions produce versioned purls", () => {
    it.effect("exact version pin", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - numpy=1.24.0"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "conda", name: "numpy", version: "1.24.0" }),
          );
        }),
      ),
    );

    it.effect("version range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - numpy >=1.24"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "conda", name: "numpy" }));
        }),
      ),
    );

    it.effect("no version is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - numpy"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result[0]?.purl).toEqual(makePurl({ type: "conda", name: "numpy" }));
        }),
      ),
    );
  });

  describe("channel qualifier", () => {
    it.effect("channel prefix on dependency", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - conda-forge::numpy=1.24.0"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("numpy");
          expect(result[0]?.purl.version).toBe("1.24.0");
        }),
      ),
    );

    it.effect("no channel has no qualifier", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - numpy=1.24.0"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("numpy");
        }),
      ),
    );
  });

  describe("pip sub-list mapped to pkg:pypi", () => {
    it.effect("pip dependencies produce pypi purls", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - numpy", "  - pip:", "    - requests==2.31.0"].join(
            "\n",
          );
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(2);

          const condaDeps = result.filter((r) => r.type === condaType);
          const pypiDeps = result.filter((r) => r.type === pypiType);

          expect(condaDeps).toHaveLength(1);
          expect(condaDeps[0]?.purl.name).toBe("numpy");

          expect(pypiDeps).toHaveLength(1);
          expect(pypiDeps[0]?.purl.name).toBe("requests");
          expect(pypiDeps[0]?.purl.version).toBe("2.31.0");
        }),
      ),
    );

    it.effect("pip dependency with range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - pip:", "    - flask>=2.0"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe(pypiType);
          expect(result[0]?.purl.name).toBe("flask");
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );

    it.effect("pip exact version", () =>
      withNodeContext(
        Effect.gen(function* () {
          const envYml = ["dependencies:", "  - pip:", "    - requests==2.31.0"].join("\n");
          const result = yield* detectInTempDir({ "environment.yml": envYml });
          expect(result).toHaveLength(1);
          expect(result[0]?.type).toBe(pypiType);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "pypi", name: "requests", version: "2.31.0" }),
          );
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// conda Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp CONDA_PREFIX for reader tests. */
const readInTempCondaPrefix = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  options?: {
    readonly axmJsonContent?: string;
    readonly aboutJsonContent?: string;
    readonly aboutJsonPkgDirPrefix?: string;
  },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const condaPrefix = path.join(tmpDir, "conda-env");

    if (options?.axmJsonContent !== undefined) {
      const axmDir = path.join(condaPrefix, "share", "axm", pkgPurl.name);
      yield* fs.makeDirectory(axmDir, { recursive: true });
      yield* fs.writeFileString(path.join(axmDir, "axm.json"), options.axmJsonContent);
    }

    if (options?.aboutJsonContent !== undefined) {
      const pkgDirName = options.aboutJsonPkgDirPrefix ?? `${pkgPurl.name}-1.0.0-py311_0`;
      const infoDir = path.join(condaPrefix, "pkgs", pkgDirName, "info");
      yield* fs.makeDirectory(infoDir, { recursive: true });
      yield* fs.writeFileString(path.join(infoDir, "about.json"), options.aboutJsonContent);
    }

    // Create source file for the detector
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "environment.yml"), "name: test");

    const detected = {
      purl: pkgPurl,
      type: condaType,
      source: path.join(sourceDir, "environment.yml"),
    };

    // Set CONDA_PREFIX for this test
    const origCondaPrefix = process.env["CONDA_PREFIX"];
    process.env["CONDA_PREFIX"] = condaPrefix;
    return yield* condaReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origCondaPrefix === undefined) {
            delete process.env["CONDA_PREFIX"];
          } else {
            process.env["CONDA_PREFIX"] = origCondaPrefix;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("condaReader", () => {
  it("has type conda", () => {
    expect(condaReader.type).toBe(condaType);
  });

  describe("valid axm.json in shared data", () => {
    it.effect("extracts recommendedExtensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "numpy" });
          const result = yield* readInTempCondaPrefix(purl, {
            axmJsonContent: JSON.stringify({
              recommendedExtensions: ["@numpy/skills/numpy@^1.0.0"],
            }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@numpy/skills/numpy@^1.0.0"]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty recommendedExtensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "scipy" });
          const result = yield* readInTempCondaPrefix(purl, {
            axmJsonContent: JSON.stringify({ recommendedExtensions: [] }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("fallback to about.json", () => {
    it.effect("extracts metadata from package cache about.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "scikit-learn" });
          const result = yield* readInTempCondaPrefix(purl, {
            aboutJsonContent: JSON.stringify({
              extra: {
                axm: {
                  recommendedExtensions: ["@sklearn/skills/sklearn@^1.0.0"],
                },
              },
            }),
            aboutJsonPkgDirPrefix: "scikit-learn-1.0.0-py311_0",
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@sklearn/skills/sklearn@^1.0.0"]);
          }
        }),
      ),
    );

    it.effect("returns Option.none when no metadata in either location", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "matplotlib" });
          const result = yield* readInTempCondaPrefix(purl, {
            aboutJsonContent: JSON.stringify({ home: "https://matplotlib.org" }),
            aboutJsonPkgDirPrefix: "matplotlib-3.7.0-py311_0",
          });
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed metadata", () => {
    it.effect("returns Option.none and warns on malformed axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "some_pkg" });
          const result = yield* readInTempCondaPrefix(purl, {
            axmJsonContent: JSON.stringify({ recommendedExtensions: null }),
          });
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "some_pkg" });
          const result = yield* readInTempCondaPrefix(purl, {
            axmJsonContent: JSON.stringify({
              recommendedExtensions: ["@acme/skills/foo@^1.0.0"],
              futureField: true,
            }),
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@acme/skills/foo@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("CONDA_PREFIX not set", () => {
    it.effect("returns Option.none when CONDA_PREFIX is not set", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "numpy" });

          const origCondaPrefix = process.env["CONDA_PREFIX"];
          delete process.env["CONDA_PREFIX"];

          const detected = {
            purl,
            type: condaType,
            source: "/tmp/fake/environment.yml",
          };

          const result = yield* condaReader.read(detected).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (origCondaPrefix === undefined) {
                  delete process.env["CONDA_PREFIX"];
                } else {
                  process.env["CONDA_PREFIX"] = origCondaPrefix;
                }
              }),
            ),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing shared data directory", () => {
    it.effect("falls back to package cache when shared data missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "conda", name: "numpy" });
          // No axmJsonContent → shared data doesn't exist, should fall through to about.json
          const result = yield* readInTempCondaPrefix(purl, {
            aboutJsonContent: JSON.stringify({
              extra: {
                axm: {
                  recommendedExtensions: ["@numpy/skills/numpy@^1.0.0"],
                },
              },
            }),
            aboutJsonPkgDirPrefix: "numpy-1.24.0-py311_0",
          });
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@numpy/skills/numpy@^1.0.0"]);
          }
        }),
      ),
    );
  });
});
