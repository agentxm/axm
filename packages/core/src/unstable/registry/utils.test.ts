/**
 * Tests for registry utility functions.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { zipSync } from "fflate";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";

import type { VersionEntry } from "./schema.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { computeIntegrity } from "../utils/index.js";
import { filterMatureVersions, parseMinimumReleaseAge } from "./release-age-policy.js";
import {
  extensionDir,
  extensionLifecycleWarnings,
  extractZip,
  pluralizeType,
  resolveVersionEntry,
  resolveVersionEntryWithReleaseAge,
  selectVersion,
} from "./utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: exactVersion("1.0.0"),
  published: "2025-01-01T00:00:00Z",
  integrity: "sha512-AAAA==",
  ...overrides,
});

// -----------------------------------------------------------------------------
// selectVersion
// -----------------------------------------------------------------------------

describe("selectVersion", () => {
  it("returns first version", () => {
    const versions = [
      makeVersionEntry({ version: exactVersion("2.0.0") }),
      makeVersionEntry({ version: exactVersion("1.0.0") }),
    ];
    const result = selectVersion(versions);
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns None for empty versions", () => {
    const result = selectVersion([]);
    expect(Option.isNone(result)).toBe(true);
  });

  it("skips yanked versions for unversioned selection", () => {
    const result = selectVersion([
      makeVersionEntry({
        version: exactVersion("2.0.0"),
        yankedAt: "2025-02-01T00:00:00Z",
      }),
      makeVersionEntry({ version: exactVersion("1.0.0") }),
    ]);

    expect(Option.getOrThrow(result).version).toBe("1.0.0");
  });
});

describe("resolveVersionEntry", () => {
  const versions = [
    makeVersionEntry({
      version: exactVersion("1.2.0"),
      yankedAt: "2025-02-01T00:00:00Z",
    }),
    makeVersionEntry({ version: exactVersion("1.1.0") }),
  ];

  it("allows a syntactically exact yanked version", () => {
    expect(Option.getOrThrow(resolveVersionEntry(versions, Option.some("1.2.0"))).version).toBe(
      "1.2.0",
    );
  });

  it("excludes yanked versions from range resolution", () => {
    expect(Option.getOrThrow(resolveVersionEntry(versions, Option.some("^1.0.0"))).version).toBe(
      "1.1.0",
    );
  });
});

describe("extensionLifecycleWarnings", () => {
  it("uses canonical plural paths for MCP servers", () => {
    const version = makeVersionEntry({
      yankedAt: "2025-02-01T00:00:00Z",
    });

    expect(
      extensionLifecycleWarnings(
        {
          owner: handle("@acme"),
          type: "mcp-server",
          name: extensionName("github"),
          publisherBindingId: "hbnd_test",
          versions: [version],
        },
        version,
      ),
    ).toEqual(["@acme/mcps/github@1.0.0 is yanked"]);
  });
});

describe("minimum release age", () => {
  it("parses duration strings", () => {
    expect(Option.getOrThrow(parseMinimumReleaseAge("24h"))).toBe(86_400_000);
    expect(Option.getOrThrow(parseMinimumReleaseAge("1440m"))).toBe(86_400_000);
    expect(Option.getOrThrow(parseMinimumReleaseAge("0s"))).toBe(0);
    expect(Option.isNone(parseMinimumReleaseAge("tomorrow"))).toBe(true);
  });

  it("filters versions newer than the configured age", () => {
    const policy = { minimumAgeMs: 24 * 60 * 60 * 1000, now: new Date("2025-01-03T00:00:00Z") };
    const versions = [
      makeVersionEntry({
        version: exactVersion("1.3.0"),
        published: "2025-01-02T23:00:00Z",
      }),
      makeVersionEntry({
        version: exactVersion("1.2.0"),
        published: "2025-01-01T00:00:00Z",
      }),
    ];

    expect(filterMatureVersions(versions, policy).map((entry) => entry.version)).toEqual(["1.2.0"]);
  });

  it("resolves the newest mature version when release age is enforced", () => {
    const policy = { minimumAgeMs: 24 * 60 * 60 * 1000, now: new Date("2025-01-03T00:00:00Z") };
    const versions = [
      makeVersionEntry({
        version: exactVersion("1.3.0"),
        published: "2025-01-02T23:00:00Z",
      }),
      makeVersionEntry({
        version: exactVersion("1.2.0"),
        published: "2025-01-01T00:00:00Z",
      }),
    ];

    const result = resolveVersionEntryWithReleaseAge(versions, Option.none(), Option.some(policy));

    expect(Option.getOrThrow(result).version).toBe("1.2.0");
  });
});

// -----------------------------------------------------------------------------
// computeIntegrity
// -----------------------------------------------------------------------------

describe("computeIntegrity", () => {
  it.effect("computes sha512 integrity in SRI format", () =>
    Effect.gen(function* () {
      const data = new TextEncoder().encode("hello world");
      const result = yield* computeIntegrity(data).pipe(Effect.provide(NodeServices.layer));
      const expected = `sha512-${createHash("sha512").update(data).digest("base64")}`;
      expect(result).toBe(expected);
    }),
  );

  it.effect("returns different integrity for different data", () =>
    Effect.gen(function* () {
      const data1 = new TextEncoder().encode("hello");
      const data2 = new TextEncoder().encode("world");
      const [result1, result2] = yield* Effect.all([
        computeIntegrity(data1),
        computeIntegrity(data2),
      ]).pipe(Effect.provide(NodeServices.layer));
      expect(result1).not.toBe(result2);
    }),
  );

  it.effect("returns consistent integrity for same data", () =>
    Effect.gen(function* () {
      const data = new TextEncoder().encode("test");
      const [result1, result2] = yield* Effect.all([
        computeIntegrity(data),
        computeIntegrity(data),
      ]).pipe(Effect.provide(NodeServices.layer));
      expect(result1).toBe(result2);
    }),
  );
});

// -----------------------------------------------------------------------------
// pluralizeType
// -----------------------------------------------------------------------------

describe("pluralizeType", () => {
  it("pluralizes skill", () => {
    expect(pluralizeType("skill")).toBe("skills");
  });

  it("pluralizes pack", () => {
    expect(pluralizeType("pack")).toBe("packs");
  });

  it("pluralizes mcp-server", () => {
    expect(pluralizeType("mcp-server")).toBe("mcps");
  });
});

// -----------------------------------------------------------------------------
// extensionDir
// -----------------------------------------------------------------------------

describe("extensionDir", () => {
  const join = (...parts: readonly string[]) => parts.join("/");

  it("builds path for skill", () => {
    const result = extensionDir("/registry", handle("@acme"), "skill", "my-skill", join);
    expect(result).toBe("/registry/extensions/@acme/skills/my-skill");
  });

  it("builds path for mcp-server", () => {
    const result = extensionDir("/registry", handle("@acme"), "mcp-server", "my-server", join);
    expect(result).toBe("/registry/extensions/@acme/mcps/my-server");
  });

  it("builds path for pack", () => {
    const result = extensionDir("/registry", handle("@test"), "pack", "frontend", join);
    expect(result).toBe("/registry/extensions/@test/packs/frontend");
  });
});

// -----------------------------------------------------------------------------
// extractZip
// -----------------------------------------------------------------------------

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("extractZip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "extract-zip-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.effect("extracts a valid zip with files", () =>
    withNodeContext(
      Effect.gen(function* () {
        const encoder = new TextEncoder();
        const archive = zipSync({
          "hello.txt": encoder.encode("hello world"),
          "data.json": encoder.encode('{"key":"value"}'),
        });

        yield* extractZip(new Uint8Array(archive), tmpDir);

        const helloContent = fs.readFileSync(path.join(tmpDir, "hello.txt"), "utf-8");
        expect(helloContent).toBe("hello world");

        const dataContent = fs.readFileSync(path.join(tmpDir, "data.json"), "utf-8");
        expect(dataContent).toBe('{"key":"value"}');
      }),
    ),
  );

  it.effect("creates nested directories", () =>
    withNodeContext(
      Effect.gen(function* () {
        const encoder = new TextEncoder();
        const archive = zipSync({
          "sub/nested/file.txt": encoder.encode("nested content"),
        });

        yield* extractZip(new Uint8Array(archive), tmpDir);

        const content = fs.readFileSync(path.join(tmpDir, "sub", "nested", "file.txt"), "utf-8");
        expect(content).toBe("nested content");

        // Verify intermediate directories exist
        expect(fs.statSync(path.join(tmpDir, "sub")).isDirectory()).toBe(true);
        expect(fs.statSync(path.join(tmpDir, "sub", "nested")).isDirectory()).toBe(true);
      }),
    ),
  );

  it.effect("fails with AppError for invalid zip data", () =>
    withNodeContext(
      Effect.gen(function* () {
        const invalidData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

        const result = yield* extractZip(invalidData, tmpDir).pipe(Effect.flip);

        expect(result.code).toBe("network");
        expect(result.detail).toContain("decompress");
      }),
    ),
  );

  it.effect("rejects an entry that escapes the target directory (zip slip)", () =>
    withNodeContext(
      Effect.gen(function* () {
        const encoder = new TextEncoder();
        // Extract into a nested dir so the traversal target stays inside the
        // per-test sandbox (tmpDir) that afterEach cleans up.
        const target = path.join(tmpDir, "target");
        fs.mkdirSync(target);
        const archive = zipSync({
          "../escaped.txt": encoder.encode("pwned"),
        });

        const result = yield* extractZip(new Uint8Array(archive), target).pipe(Effect.flip);

        expect(result.code).toBe("validation");
        expect(result.detail).toContain("outside");

        // The traversal target (target's parent) must never be written.
        const escaped = path.join(tmpDir, "escaped.txt");
        expect(fs.existsSync(escaped)).toBe(false);
      }),
    ),
  );

  it.effect("rejects an entry with an absolute path", () =>
    withNodeContext(
      Effect.gen(function* () {
        const encoder = new TextEncoder();
        const target = path.join(tmpDir, "target");
        fs.mkdirSync(target);
        const outside = path.join(tmpDir, "abs-escaped.txt");
        const archive = zipSync({
          [outside]: encoder.encode("pwned"),
        });

        const result = yield* extractZip(new Uint8Array(archive), target).pipe(Effect.flip);

        expect(result.code).toBe("validation");
        expect(fs.existsSync(outside)).toBe(false);
      }),
    ),
  );
});
