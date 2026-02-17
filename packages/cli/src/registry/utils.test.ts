/**
 * Tests for registry utility functions.
 */

import { createHash } from "node:crypto";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import type { VersionEntry } from "./schema.js";
import { computeChecksum } from "../utils/checksum.js";
import { extensionDir, pluralizeType, selectVersion } from "./utils.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
  published: "2025-01-01T00:00:00Z",
  agents: ["claude-code"],
  checksum: "sha256:0000",
  ...overrides,
});

// -----------------------------------------------------------------------------
// selectVersion
// -----------------------------------------------------------------------------

describe("selectVersion", () => {
  it("returns first version when no agent filter", () => {
    const versions = [
      makeVersionEntry({ version: "2.0.0" }),
      makeVersionEntry({ version: "1.0.0" }),
    ];
    const result = selectVersion(versions, { agents: [] });
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns None for empty versions", () => {
    const result = selectVersion([], { agents: [] });
    expect(Option.isNone(result)).toBe(true);
  });

  it("matches agent compatibility", () => {
    const versions = [
      makeVersionEntry({ version: "2.0.0", agents: ["cursor"] }),
      makeVersionEntry({ version: "1.0.0", agents: ["claude-code"] }),
    ];
    const result = selectVersion(versions, { agents: ["claude-code"] });
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("1.0.0");
  });

  it("returns None when no agent matches", () => {
    const versions = [makeVersionEntry({ version: "1.0.0", agents: ["cursor"] })];
    const result = selectVersion(versions, { agents: ["claude-code"] });
    expect(Option.isNone(result)).toBe(true);
  });

  it("returns version with empty agents (universal) when agent filter is set", () => {
    const versions = [makeVersionEntry({ version: "1.0.0", agents: [] })];
    const result = selectVersion(versions, { agents: ["claude-code"] });
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("1.0.0");
  });

  it("returns first version when version.agents is non-empty but options.agents is empty", () => {
    const versions = [makeVersionEntry({ version: "1.0.0", agents: ["cursor"] })];
    const result = selectVersion(versions, { agents: [] });
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("1.0.0");
  });
});

// -----------------------------------------------------------------------------
// computeChecksum
// -----------------------------------------------------------------------------

describe("computeChecksum", () => {
  it("computes sha256 checksum with prefix", async () => {
    const data = new TextEncoder().encode("hello world");
    const result = await Effect.runPromise(
      computeChecksum(data).pipe(Effect.provide(NodeContext.layer)),
    );
    const expected = `sha256:${createHash("sha256").update(data).digest("hex")}`;
    expect(result).toBe(expected);
  });

  it("returns different checksum for different data", async () => {
    const data1 = new TextEncoder().encode("hello");
    const data2 = new TextEncoder().encode("world");
    const [result1, result2] = await Effect.runPromise(
      Effect.all([computeChecksum(data1), computeChecksum(data2)]).pipe(
        Effect.provide(NodeContext.layer),
      ),
    );
    expect(result1).not.toBe(result2);
  });

  it("returns consistent checksum for same data", async () => {
    const data = new TextEncoder().encode("test");
    const [result1, result2] = await Effect.runPromise(
      Effect.all([computeChecksum(data), computeChecksum(data)]).pipe(
        Effect.provide(NodeContext.layer),
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
