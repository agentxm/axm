import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlPartsSchema } from "./package-url.js";
import { swiftDetector, swiftReader } from "./swift.js";

const swiftType = Schema.decodeUnknownSync(PackageTypeSchema)("swift");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write Package.swift, run detector, clean up. */
const detectInTempDir = (packageSwift?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (packageSwift !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "Package.swift"), packageSwift);
    }
    return yield* swiftDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("swiftDetector", () => {
  it("has type swift", () => {
    expect(swiftDetector.type).toBe(swiftType);
  });

  describe("dependencies from Package.swift", () => {
    it.effect("extracts package url dependencies", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MyProject",
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.6.0"),
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.2.0"),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("Alamofire");
          expect(names).toContain("swift-argument-parser");
        }),
      ),
    );
  });

  describe("namespace derived from URL", () => {
    it.effect("GitHub URL produces namespace with host and org", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
let package = Package(
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.6.0"),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "swift",
              namespace: "github.com/Alamofire",
              name: "Alamofire",
            }),
          );
        }),
      ),
    );

    it.effect("GitHub URL without .git suffix", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
let package = Package(
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.2.0"),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "swift",
              namespace: "github.com/apple",
              name: "swift-argument-parser",
            }),
          );
        }),
      ),
    );

    it.effect("custom host URL", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
let package = Package(
    dependencies: [
        .package(url: "https://gitlab.example.com/team/MyLibrary.git", from: "1.0.0"),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "swift",
              namespace: "gitlab.example.com/team",
              name: "MyLibrary",
            }),
          );
        }),
      ),
    );
  });

  describe("exact versions produce versioned purls", () => {
    it.effect("exact version includes version in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
let package = Package(
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire.git", exact: "5.6.2"),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "swift",
              namespace: "github.com/Alamofire",
              name: "Alamofire",
              version: "5.6.2",
            }),
          );
        }),
      ),
    );
  });

  describe("version ranges produce versionless purls", () => {
    it.effect("from range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
let package = Package(
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.6.0"),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({
              type: "swift",
              namespace: "github.com/Alamofire",
              name: "Alamofire",
            }),
          );
        }),
      ),
    );

    it.effect("upToNextMajor range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
let package = Package(
    dependencies: [
        .package(url: "https://github.com/apple/swift-log.git", .upToNextMajor(from: "1.0.0")),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );

    it.effect("upToNextMinor range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
let package = Package(
    dependencies: [
        .package(url: "https://github.com/apple/swift-log.git", .upToNextMinor(from: "1.2.0")),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );
  });

  describe("missing Package.swift", () => {
    it.effect("returns empty array when Package.swift is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependencies", () => {
    it.effect("returns empty array when no dependencies declared", () =>
      withNodeContext(
        Effect.gen(function* () {
          const packageSwift = `
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MyProject",
    targets: [
        .target(name: "MyProject"),
    ]
)`;
          const result = yield* detectInTempDir(packageSwift);
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// swift Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp project with .build/checkouts for reader tests. */
const readInTempDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Write the root Package.swift (source for the detected package)
    yield* fs.writeFileString(path.join(tmpDir, "Package.swift"), "// Package.swift");

    if (axmJsonContent !== undefined) {
      const checkoutDir = path.join(tmpDir, ".build", "checkouts", pkgPurl.name);
      yield* fs.makeDirectory(checkoutDir, { recursive: true });
      yield* fs.writeFileString(path.join(checkoutDir, "axm.json"), axmJsonContent);
    }

    const detected = {
      purl: pkgPurl,
      type: swiftType,
      source: path.join(tmpDir, "Package.swift"),
    };
    return yield* swiftReader.read(detected);
  }).pipe(Effect.scoped);

describe("swiftReader", () => {
  it("has type swift", () => {
    expect(swiftReader.type).toBe(swiftType);
  });

  describe("valid axm.json sidecar", () => {
    it.effect("extracts recommendedExtensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "swift",
            namespace: "github.com/apple",
            name: "swift-nio",
          });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              recommendedExtensions: ["@apple/skills/swift-nio@^2.0.0"],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@apple/skills/swift-nio@^2.0.0"]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty recommendedExtensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "swift",
            namespace: "github.com/apple",
            name: "swift-log",
          });
          const result = yield* readInTempDir(purl, JSON.stringify({ recommendedExtensions: [] }));
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing axm.json sidecar", () => {
    it.effect("returns Option.none when axm.json does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "swift",
            namespace: "github.com/apple",
            name: "swift-argument-parser",
          });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm.json", () => {
    it.effect("returns Option.none and warns on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "swift",
            namespace: "github.com/some",
            name: "some-package",
          });
          const result = yield* readInTempDir(purl, JSON.stringify({ recommendedExtensions: 42 }));
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "swift",
            namespace: "github.com/some",
            name: "some-package",
          });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              recommendedExtensions: ["@acme/skills/foo@^1.0.0"],
              futureField: true,
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual(["@acme/skills/foo@^1.0.0"]);
          }
        }),
      ),
    );
  });

  describe("missing checkouts directory", () => {
    it.effect("returns Option.none when .build/checkouts does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "swift",
            namespace: "github.com/apple",
            name: "swift-nio",
          });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed JSON in axm.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "swift",
            namespace: "github.com/some",
            name: "some-package",
          });
          const result = yield* readInTempDir(purl, "{ not valid json }");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
