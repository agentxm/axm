/**
 * Tests for registry utility functions.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry/schema";
import { exactVersion, extensionName, handle } from "./test-helpers.js";
import { extensionDir, extensionLifecycleWarnings } from "./utils.js";

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
  it("reports archival once before an exact-version yank message", () => {
    const version = makeVersionEntry({
      yankedAt: DateTime.makeUnsafe("2025-02-01T00:00:00Z"),
      yankMessage: "Security issue",
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
            message: "No longer maintained",
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
