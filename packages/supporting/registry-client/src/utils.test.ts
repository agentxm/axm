/**
 * Tests for registry utility functions.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { zipSync } from "fflate";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";

import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry/schema";
import { exactVersion, extensionName, handle } from "./test-helpers.js";
import { extensionDir, extensionLifecycleWarnings, extractZip, pluralizeType } from "./utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: exactVersion("1.0.0"),
  published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
  integrity: "sha512-AAAA==",
  ...overrides,
});

describe("extensionLifecycleWarnings", () => {
  it("reports archival once before an exact-version yank notice", () => {
    const version = makeVersionEntry({
      yankedAt: DateTime.makeUnsafe("2025-02-01T00:00:00Z"),
      yankNotice: "Security issue",
    });

    expect(
      extensionLifecycleWarnings(
        {
          owner: handle("@acme"),
          type: "skill",
          name: extensionName("review"),
          publisherBindingId: "hbnd_test",
          archival: {
            archivedAt: DateTime.makeUnsafe("2025-03-01T00:00:00Z"),
            reason: "No longer maintained",
          },
          deprecation: null,
          versions: [version],
        },
        version,
      ),
    ).toEqual([
      "@acme/skills/review is archived: No longer maintained",
      "@acme/skills/review@1.0.0 is yanked: Security issue",
    ]);
  });

  it("uses canonical plural paths for MCP servers", () => {
    const version = makeVersionEntry({
      yankedAt: DateTime.makeUnsafe("2025-02-01T00:00:00Z"),
    });

    expect(
      extensionLifecycleWarnings(
        {
          owner: handle("@acme"),
          type: "mcp-server",
          name: extensionName("github"),
          publisherBindingId: "hbnd_test",
          archival: null,
          deprecation: null,
          versions: [version],
        },
        version,
      ),
    ).toEqual(["@acme/mcps/github@1.0.0 is yanked"]);
  });
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

  it.effect("fails with a typed validation failure for invalid zip data", () =>
    withNodeContext(
      Effect.gen(function* () {
        const invalidData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

        const result = yield* extractZip(invalidData, tmpDir).pipe(Effect.flip);

        expect(result.category).toBe("validation");
        expect(result.detail).toContain("decompress");
      }),
    ),
  );

  it.effect("rejects declared expansion before writing any files", () =>
    withNodeContext(
      Effect.gen(function* () {
        const archive = zipSync({ "large.txt": new TextEncoder().encode("longer than four") });
        const result = yield* extractZip(archive, tmpDir, { maxExpandedBytes: 4 }).pipe(
          Effect.flip,
        );

        expect(result.category).toBe("quota");
        expect(result.detail).toContain("extracted byte limit");
        expect(fs.readdirSync(tmpDir)).toEqual([]);
      }),
    ),
  );

  it.effect("enforces actual expanded bytes when ZIP metadata understates them", () =>
    withNodeContext(
      Effect.gen(function* () {
        const archive = zipSync({ "large.txt": new TextEncoder().encode("longer than four") });
        const centralDirectory = archive.findIndex(
          (byte, index) =>
            byte === 0x50 &&
            archive[index + 1] === 0x4b &&
            archive[index + 2] === 0x01 &&
            archive[index + 3] === 0x02,
        );
        expect(centralDirectory).toBeGreaterThanOrEqual(0);
        const view = new DataView(archive.buffer, archive.byteOffset);
        view.setUint32(22, 1, true);
        view.setUint32(centralDirectory + 24, 1, true);

        const result = yield* extractZip(archive, tmpDir, { maxExpandedBytes: 4 }).pipe(
          Effect.flip,
        );

        expect(result.category).toBe("quota");
        expect(result.detail).toContain("extracted byte limit");
        expect(fs.readdirSync(tmpDir)).toEqual([]);
      }),
    ),
  );

  it.effect("rejects too many entries before writing any files", () =>
    withNodeContext(
      Effect.gen(function* () {
        const archive = zipSync({
          "first.txt": new TextEncoder().encode("first"),
          "second.txt": new TextEncoder().encode("second"),
        });
        const result = yield* extractZip(archive, tmpDir, { maxEntries: 1 }).pipe(Effect.flip);

        expect(result.category).toBe("quota");
        expect(result.detail).toContain("entry limit");
        expect(fs.readdirSync(tmpDir)).toEqual([]);
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

        expect(result.category).toBe("validation");
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

        expect(result.category).toBe("validation");
        expect(fs.existsSync(outside)).toBe(false);
      }),
    ),
  );
});
