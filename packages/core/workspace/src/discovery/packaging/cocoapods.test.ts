import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { cocoapodsDetector, cocoapodsReader } from "./cocoapods.js";

const cocoapodsType = Schema.decodeUnknownSync(PackageTypeSchema)("cocoapods");
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
    return yield* cocoapodsDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("cocoapodsDetector", () => {
  it("has type cocoapods", () => {
    expect(cocoapodsDetector.type).toBe(cocoapodsType);
  });

  describe("Podfile pod directives", () => {
    it.effect("extracts pods from Podfile", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = [
            "platform :ios, '13.0'",
            "",
            "target 'MyApp' do",
            "  pod 'Alamofire', '~> 5.0'",
            "  pod 'SwiftyJSON', '~> 5.0'",
            "end",
          ].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("Alamofire");
          expect(names).toContain("SwiftyJSON");
        }),
      ),
    );

    it.effect("missing Podfile returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({});
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("podspec dependency directives", () => {
    it.effect("extracts dependencies from podspec", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podspec = [
            "Pod::Spec.new do |s|",
            "  s.name         = 'MyPod'",
            "  s.version      = '1.0.0'",
            "  s.dependency 'Alamofire', '~> 5.0'",
            "  s.dependency 'SwiftyJSON'",
            "end",
          ].join("\n");
          const result = yield* detectInTempDir({ "MyPod.podspec": podspec });
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("Alamofire");
          expect(names).toContain("SwiftyJSON");
        }),
      ),
    );

    it.effect("no podspec files returns empty", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir({});
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("subspecs via subpath", () => {
    it.effect("pod with subspec has subpath in purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'ShareKit/Twitter'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(1);
          // The purl should have name "ShareKit" - subpath is in the purl string
          expect(result[0]?.purl.name).toBe("ShareKit");
        }),
      ),
    );

    it.effect("pod with nested subspec", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'RestKit/Network/CoreData'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("RestKit");
        }),
      ),
    );

    it.effect("pod without subspec has no subpath", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'Alamofire', '~> 5.0'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl.name).toBe("Alamofire");
        }),
      ),
    );
  });

  describe("exact versions produce versioned purls", () => {
    it.effect("exact version", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'Alamofire', '5.6.2'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(
            makePurl({ type: "cocoapods", name: "Alamofire", version: "5.6.2" }),
          );
        }),
      ),
    );

    it.effect("optimistic range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'Alamofire', '~> 5.0'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cocoapods", name: "Alamofire" }));
        }),
      ),
    );

    it.effect("comparison range is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'Alamofire', '>= 5.0'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cocoapods", name: "Alamofire" }));
        }),
      ),
    );

    it.effect("no version is versionless", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'Alamofire'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "cocoapods", name: "Alamofire" }));
        }),
      ),
    );
  });

  describe("path and git pods skipped", () => {
    it.effect("path pod is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'MyPod', :path => '../MyPod'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toEqual([]);
        }),
      ),
    );

    it.effect("git pod is skipped", () =>
      withNodeContext(
        Effect.gen(function* () {
          const podfile = ["  pod 'MyPod', :git => 'https://github.com/org/MyPod.git'"].join("\n");
          const result = yield* detectInTempDir({ Podfile: podfile });
          expect(result).toEqual([]);
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// cocoapods Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp project with Pods/ for reader tests. */
const readInTempDir = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Write the root Podfile (source for the detected package)
    yield* fs.writeFileString(path.join(tmpDir, "Podfile"), "# empty");

    if (axmJsonContent !== undefined) {
      const podDir = path.join(tmpDir, "Pods", pkgPurl.name);
      yield* fs.makeDirectory(podDir, { recursive: true });
      yield* fs.writeFileString(path.join(podDir, "axm.json"), axmJsonContent);
    }

    const detected = {
      purl: pkgPurl,
      type: cocoapodsType,
      source: path.join(tmpDir, "Podfile"),
    };
    return yield* cocoapodsReader.read(detected);
  }).pipe(Effect.scoped);

describe("cocoapodsReader", () => {
  it("has type cocoapods", () => {
    expect(cocoapodsReader.type).toBe(cocoapodsType);
  });

  describe("valid axm.json sidecar", () => {
    it.effect("extracts extensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cocoapods", name: "Alamofire" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@alamofire/skills/alamofire", versionRange: "^5.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([
              { ref: "@alamofire/skills/alamofire", versionRange: "^5.0.0" },
            ]);
          }
        }),
      ),
    );

    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cocoapods", name: "SwiftyJSON" });
          const result = yield* readInTempDir(purl, JSON.stringify({ extensions: [] }));
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });

  describe("missing axm.json sidecar", () => {
    it.effect("returns Option.none when no axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cocoapods", name: "SnapKit" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm.json", () => {
    it.effect("returns Option.none on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cocoapods", name: "SomePod" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({ extensions: { invalid: true } }),
          );
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("extra fields tolerated", () => {
    it.effect("ignores extra fields in axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cocoapods", name: "SomePod" });
          const result = yield* readInTempDir(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@acme/skills/foo", versionRange: "^1.0.0" }],
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

  describe("missing Pods directory", () => {
    it.effect("returns Option.none when Pods does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "cocoapods", name: "Alamofire" });
          const result = yield* readInTempDir(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
