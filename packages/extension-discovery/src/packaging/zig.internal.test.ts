import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { zigDetector, zigReader } from "./zig.js";

const zigType = Schema.decodeUnknownSync(PackageTypeSchema)("zig");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Create a temp dir, write build.zig.zon, run detector, clean up. */
const detectInTempDir = (buildZigZon?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();
    if (buildZigZon !== undefined) {
      yield* fs.writeFileString(path.join(tmpDir, "build.zig.zon"), buildZigZon);
    }
    return yield* zigDetector.detect(tmpDir);
  }).pipe(Effect.scoped);

describe("zigDetector", () => {
  it("has type zig", () => {
    expect(zigDetector.type).toBe(zigType);
  });

  describe("dependencies extracted from build.zig.zon", () => {
    it.effect("extracts dependency names from .dependencies field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const zon = `.{
    .name = "my-project",
    .version = "0.1.0",
    .dependencies = .{
        .zap = .{
            .url = "https://github.com/zigzap/zap/archive/v0.1.0.tar.gz",
            .hash = "1234567890abcdef",
        },
        .mach = .{
            .url = "https://github.com/hexops/mach/archive/v0.2.0.tar.gz",
            .hash = "abcdef1234567890",
        },
    },
}`;
          const result = yield* detectInTempDir(zon);
          expect(result).toHaveLength(2);
          const names = result.map((r) => r.purl.name);
          expect(names).toContain("zap");
          expect(names).toContain("mach");
        }),
      ),
    );

    it.effect("produces pkg:zig purls", () =>
      withNodeContext(
        Effect.gen(function* () {
          const zon = `.{
    .dependencies = .{
        .ziglyph = .{
            .url = "https://github.com/...",
            .hash = "abc123",
        },
    },
}`;
          const result = yield* detectInTempDir(zon);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "zig", name: "ziglyph" }));
        }),
      ),
    );
  });

  describe("quoted dependency names", () => {
    it.effect("handles @-quoted dependency names", () =>
      withNodeContext(
        Effect.gen(function* () {
          const zon = `.{
    .dependencies = .{
        .@"zig-network" = .{
            .url = "https://github.com/...",
            .hash = "abc123",
        },
    },
}`;
          const result = yield* detectInTempDir(zon);
          expect(result).toHaveLength(1);
          expect(result[0]?.purl).toEqual(makePurl({ type: "zig", name: "zig-network" }));
        }),
      ),
    );
  });

  describe("missing build.zig.zon", () => {
    it.effect("returns empty array when build.zig.zon is missing", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir();
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("malformed build.zig.zon", () => {
    it.effect("returns empty array on malformed content", () =>
      withNodeContext(
        Effect.gen(function* () {
          const result = yield* detectInTempDir("{{{{ not valid zon ????");
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("no dependencies field", () => {
    it.effect("returns empty array when no .dependencies field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const zon = `.{
    .name = "my-project",
    .version = "0.1.0",
}`;
          const result = yield* detectInTempDir(zon);
          expect(result).toEqual([]);
        }),
      ),
    );
  });

  describe("URL and hash not encoded in purl", () => {
    it.effect("dependency URL and hash are not part of the purl", () =>
      withNodeContext(
        Effect.gen(function* () {
          const zon = `.{
    .dependencies = .{
        .zap = .{
            .url = "https://github.com/zigzap/zap/archive/v0.1.0.tar.gz",
            .hash = "1234567890abcdef",
        },
    },
}`;
          const result = yield* detectInTempDir(zon);
          expect(result).toHaveLength(1);
          // Purl should be versionless with no URL/hash data
          expect(result[0]?.purl).toEqual(makePurl({ type: "zig", name: "zap" }));
          expect(result[0]?.purl.version).toBeUndefined();
        }),
      ),
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Zig Reader tests
// ──────────────────────────────────────────────────────────────────

/** Helper to set up a temp Zig cache with axm.json for reader tests. */
const readInTempZigCache = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  axmJsonContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    // Set up a fake Zig cache structure
    const zigCacheDir = path.join(tmpDir, ".cache", "zig", "p");

    if (axmJsonContent !== undefined) {
      const hashDir = path.join(zigCacheDir, "abc123def456");
      yield* fs.makeDirectory(hashDir, { recursive: true });
      yield* fs.writeFileString(path.join(hashDir, "axm.json"), axmJsonContent);
    }

    // Create a source file
    const sourceDir = path.join(tmpDir, "project");
    yield* fs.makeDirectory(sourceDir, { recursive: true });
    yield* fs.writeFileString(path.join(sourceDir, "build.zig.zon"), ".{}");

    const detected = {
      purl: pkgPurl,
      type: zigType,
      source: path.join(sourceDir, "build.zig.zon"),
    };

    // Override HOME for this test to redirect ~/.cache/zig
    const origHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;

    return yield* zigReader.read(detected).pipe(
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

describe("zigReader", () => {
  it("has type zig", () => {
    expect(zigReader.type).toBe(zigType);
  });

  describe("valid axm.json in cache", () => {
    it.effect("extracts extensions from axm.json", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "zig", name: "zap" });
          const result = yield* readInTempZigCache(
            purl,
            JSON.stringify({
              extensions: [{ ref: "@zig/skills/zap", versionRange: "^1.0.0" }],
            }),
          );
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@zig/skills/zap", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing axm.json", () => {
    it.effect("returns Option.none when no axm.json exists", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "zig", name: "zap" });
          const result = yield* readInTempZigCache(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed axm.json", () => {
    it.effect("returns Option.none on malformed metadata", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "zig", name: "zap" });
          const result = yield* readInTempZigCache(
            purl,
            JSON.stringify({ extensions: "not-an-array" }),
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
          const purl = makePurl({ type: "zig", name: "zap" });
          const result = yield* readInTempZigCache(
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

  describe("missing Zig cache", () => {
    it.effect("returns Option.none when Zig cache does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "zig", name: "zap" });
          // readInTempZigCache without axmJsonContent won't create the cache dir
          const result = yield* readInTempZigCache(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed JSON in axm.json", () => {
    it.effect("returns Option.none on invalid JSON", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "zig", name: "zap" });
          const result = yield* readInTempZigCache(purl, "{ not valid json }");
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });
});
