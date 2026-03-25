/**
 * Tests for registry utility functions.
 */

import { createHash } from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import type { VersionEntry } from "./local-schema.js";
import { computeIntegrity } from "@axm.sh/core/unstable/utils";
import { extensionDir, pluralizeType, selectVersion } from "./utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
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
      makeVersionEntry({ version: "2.0.0" }),
      makeVersionEntry({ version: "1.0.0" }),
    ];
    const result = selectVersion(versions);
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns None for empty versions", () => {
    const result = selectVersion([]);
    expect(Option.isNone(result)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// computeIntegrity
// -----------------------------------------------------------------------------

describe("computeIntegrity", () => {
  it("computes sha512 integrity in SRI format", async () => {
    const data = new TextEncoder().encode("hello world");
    const result = await Effect.runPromise(
      computeIntegrity(data).pipe(Effect.provide(NodeServices.layer)),
    );
    const expected = `sha512-${createHash("sha512").update(data).digest("base64")}`;
    expect(result).toBe(expected);
  });

  it("returns different integrity for different data", async () => {
    const data1 = new TextEncoder().encode("hello");
    const data2 = new TextEncoder().encode("world");
    const [result1, result2] = await Effect.runPromise(
      Effect.all([computeIntegrity(data1), computeIntegrity(data2)]).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(result1).not.toBe(result2);
  });

  it("returns consistent integrity for same data", async () => {
    const data = new TextEncoder().encode("test");
    const [result1, result2] = await Effect.runPromise(
      Effect.all([computeIntegrity(data), computeIntegrity(data)]).pipe(
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(result1).toBe(result2);
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
    expect(pluralizeType("mcp-server")).toBe("mcp-servers");
  });
});

// -----------------------------------------------------------------------------
// extensionDir
// -----------------------------------------------------------------------------

describe("extensionDir", () => {
  const join = (...parts: readonly string[]) => parts.join("/");

  it("builds path for skill", () => {
    const result = extensionDir("/registry", "@acme", "skill", "my-skill", join);
    expect(result).toBe("/registry/extensions/@acme/skills/my-skill");
  });

  it("builds path for mcp-server", () => {
    const result = extensionDir("/registry", "@acme", "mcp-server", "my-server", join);
    expect(result).toBe("/registry/extensions/@acme/mcp-servers/my-server");
  });

  it("builds path for pack", () => {
    const result = extensionDir("/registry", "@test", "pack", "frontend", join);
    expect(result).toBe("/registry/extensions/@test/packs/frontend");
  });
});
