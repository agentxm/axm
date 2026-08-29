import { fileURLToPath, pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { pubDetector, pubReader } from "./pub.js";

const pubType = Schema.decodeUnknownSync(PackageTypeSchema)("pub");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write pubspec.yaml, run detector, clean up. */
const detectInTempDir = (pubspecYaml?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (pubspecYaml !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "pubspec.yaml"), pubspecYaml);
    }
    return yield* pubDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("pubDetector", () => {
  it("has type pub", () => {
    expect(pubDetector.type).toBe(pubType);
  });

  describe("dependencies from both sections", () => {
    it.effect("extracts from dependencies and dev_dependencies", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = [
            "name: my_app",
            "version: 1.0.0",
            "",
            "dependencies:",
            "  http: ^1.0.0",
            "  provider: ^6.0.0",
            "",
            "dev_dependencies:",
            "  test: ^1.24.0",
          ].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toHaveLength(3);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("http");
          expect(names).toContain("provider");
          expect(names).toContain("test");
        }),
      ),
    );
  });

  describe("missing pubspec.yaml", () => {
    it.effect("returns empty array when pubspec.yaml is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed pubspec.yaml", () => {
    it.effect("returns empty array on malformed content", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{{{ not valid yaml }}}");
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependency sections", () => {
    it.effect("returns empty array when no dependency sections exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["name: my_app", "version: 1.0.0", "description: A sample app"].join(
            "\n",
          );
          const result = yield* detectInTempDir(pubspec);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("simple version string", () => {
    it.effect("extracts hosted dependency with version range", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  http: ^1.0.0"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "pub", name: "http" }));
        }),
      ),
    );
  });

  describe("map with version key", () => {
    it.effect("extracts hosted dependency with version in map form", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  http:", "      version: ^1.0.0"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "pub", name: "http" }));
        }),
      ),
    );
  });

  describe("non-hosted dependencies skipped", () => {
    it.effect("path dependency is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  my_lib:", "      path: ../my_lib"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("git dependency is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = [
            "dependencies:",
            "  my_lib:",
            "      git: https://github.com/org/my_lib.git",
          ].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("sdk dependency is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  flutter:", "      sdk: flutter"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("exact versions produce versioned purls", () => {
    it.effect("exact version includes version in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  http: 1.2.0"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "pub", name: "http", version: "1.2.0" }),
          );
        }),
      ),
    );

    it.effect("caret range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  http: ^1.0.0"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "pub", name: "http" }));
        }),
      ),
    );

    it.effect("any is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  http: any"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "pub", name: "http" }));
        }),
      ),
    );

    it.effect("comparison range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", '  http: ">=1.0.0 <2.0.0"'].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "pub", name: "http" }));
        }),
      ),
    );
  });

  describe("invalid package names skipped", () => {
    it.effect("uppercase name is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const pubspec = ["dependencies:", "  InvalidName: ^1.0.0"].join("\n");
          const result = yield* detectInTempDir(pubspec);
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// pub Reader tests
// ──────────────────────────────────────────────────────────────────

/**
 * Resolve a package_config.json `rootUri` the same way the reader does, so
 * fixtures with `file://` URIs land where the reader will look for them.
 */
const resolveRootUri = (dartToolDir: string, rootUri: string): string =>
  fileURLToPath(new URL(rootUri, new URL(`${pathToFileURL(dartToolDir).href}/`)));

/**
 * Helper to set up a temp project with .dart_tool/package_config.json for
 * reader tests. `packageConfig` may be a function of the temp dir so fixtures
 * can embed absolute `file://` URIs built from the dynamic temp path.
 */
const readInTempDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  packageConfig?: string | ((tmpDir: string) => string),
  targetPubspec?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Write the root pubspec.yaml (source for the detected package)
    yield* fs.writeFileString(path.join(tmpDir, "pubspec.yaml"), "name: my_app");

    const resolvedConfig =
      typeof packageConfig === "function" ? packageConfig(tmpDir) : packageConfig;

    if (resolvedConfig !== undefined) {
      const dartToolDir = path.join(tmpDir, ".dart_tool");
      yield* fs.makeDirectory(dartToolDir, { recursive: true });
      yield* fs.writeFileString(path.join(dartToolDir, "package_config.json"), resolvedConfig);
    }

    if (targetPubspec !== undefined && resolvedConfig !== undefined) {
      // Parse the package config to find the rootUri and write the pubspec there
      const config = JSON.parse(resolvedConfig) as {
        packages?: Array<{ name: string; rootUri: string }>;
      };
      const pkgEntry = config.packages?.find((p) => p.name === pkgPurl.name);
      if (pkgEntry !== undefined) {
        const dartToolDir = path.resolve(tmpDir, ".dart_tool");
        const packageRoot = resolveRootUri(dartToolDir, pkgEntry.rootUri);
        yield* fs.makeDirectory(packageRoot, { recursive: true });
        yield* fs.writeFileString(path.join(packageRoot, "pubspec.yaml"), targetPubspec);
      }
    }

    const detected = {
      purl: pkgPurl,
      type: pubType,
      source: path.join(tmpDir, "pubspec.yaml"),
    };
    return yield* pubReader.read(detected);
  }).pipe(Effect.scoped);

describe("pubReader", () => {
  it("has type pub", () => {
    expect(pubReader.type).toBe(pubType);
  });

  describe("valid axm metadata", () => {
    it.effect("extracts extensions from axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "riverpod" });
          const packageConfig = JSON.stringify({
            configVersion: 2,
            packages: [
              {
                name: "riverpod",
                rootUri: "../.pub-cache/hosted/pub.dev/riverpod-2.0.0",
              },
            ],
          });
          const targetPubspec = [
            "name: riverpod",
            "version: 2.0.0",
            "",
            "axm:",
            "  extensions:",
            '    - { ref: "@riverpod/skills/riverpod", versionRange: "^2.0.0" }',
          ].join("\n");

          const result = yield* readInTempDir(purl, packageConfig, targetPubspec);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@riverpod/skills/riverpod", versionRange: "^2.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "some_lib" });
          const packageConfig = JSON.stringify({
            configVersion: 2,
            packages: [
              { name: "some_lib", rootUri: "../.pub-cache/hosted/pub.dev/some_lib-1.0.0" },
            ],
          });
          const targetPubspec = ["name: some_lib", "", "axm:", "  extensions: []"].join("\n");

          const result = yield* readInTempDir(purl, packageConfig, targetPubspec);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("file:// rootUri", () => {
    it.effect("resolves an absolute file:// rootUri written by `dart pub get`", () =>
      withNodeContext(
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const purl = makePurl({ type: "pub", name: "riverpod" });
          const packageConfig = (tmpDir: string) =>
            JSON.stringify({
              configVersion: 2,
              packages: [
                {
                  name: "riverpod",
                  rootUri: pathToFileURL(
                    path.join(tmpDir, ".pub-cache", "hosted", "pub.dev", "riverpod-2.0.0"),
                  ).href,
                },
              ],
            });
          const targetPubspec = [
            "name: riverpod",
            "version: 2.0.0",
            "",
            "axm:",
            "  extensions:",
            '    - { ref: "@riverpod/skills/riverpod", versionRange: "^2.0.0" }',
          ].join("\n");

          const result = yield* readInTempDir(purl, packageConfig, targetPubspec);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@riverpod/skills/riverpod", versionRange: "^2.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns Option.none for a non-file rootUri scheme", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "riverpod" });
          const packageConfig = JSON.stringify({
            configVersion: 2,
            packages: [{ name: "riverpod", rootUri: "https://example.com/riverpod-2.0.0" }],
          });

          const result = yield* readInTempDir(purl, packageConfig);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing axm field", () => {
    it.effect("returns Option.none when no axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "http" });
          const packageConfig = JSON.stringify({
            configVersion: 2,
            packages: [{ name: "http", rootUri: "../.pub-cache/hosted/pub.dev/http-1.0.0" }],
          });
          const targetPubspec = ["name: http", "version: 1.0.0"].join("\n");

          const result = yield* readInTempDir(purl, packageConfig, targetPubspec);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm metadata", () => {
    it.effect("returns Option.none and warns on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "bad_lib" });
          const packageConfig = JSON.stringify({
            configVersion: 2,
            packages: [{ name: "bad_lib", rootUri: "../.pub-cache/hosted/pub.dev/bad_lib-1.0.0" }],
          });
          const targetPubspec = ["name: bad_lib", "", "axm:", "  extensions: 123"].join("\n");

          const result = yield* readInTempDir(purl, packageConfig, targetPubspec);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("missing .dart_tool directory", () => {
    it.effect("returns Option.none when .dart_tool does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "http" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("package not found in package_config.json", () => {
    it.effect("returns Option.none when package not in config", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "missing_pkg" });
          const packageConfig = JSON.stringify({
            configVersion: 2,
            packages: [
              { name: "other_pkg", rootUri: "../.pub-cache/hosted/pub.dev/other_pkg-1.0.0" },
            ],
          });

          const result = yield* readInTempDir(purl, packageConfig);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "pub", name: "some_lib" });
          const packageConfig = JSON.stringify({
            configVersion: 2,
            packages: [
              { name: "some_lib", rootUri: "../.pub-cache/hosted/pub.dev/some_lib-1.0.0" },
            ],
          });
          const targetPubspec = [
            "name: some_lib",
            "",
            "axm:",
            "  extensions:",
            '    - { ref: "@acme/skills/foo", versionRange: "^1.0.0" }',
            "  futureField: true",
          ].join("\n");

          const result = yield* readInTempDir(purl, packageConfig, targetPubspec);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });
});
