import { describe, expect, it } from "@effect/vitest";
import { buildAxmMcpMetadata, buildAxmMcpMetadataFromSettingsSource } from "./metadata.js";

describe("AXM MCP metadata builders", () => {
  it("builds inline metadata without a ref", () => {
    expect(buildAxmMcpMetadataFromSettingsSource("inline", "linear")).toEqual({
      v: 1,
      managed: true,
      ext: "@workspace/mcps/linear",
      source: "inline",
    });
  });

  it("builds registry metadata with a resolvable ref", () => {
    expect(
      buildAxmMcpMetadata({
        ext: "@owner/mcps/secure-api",
        source: "registry",
        ref: "@owner/mcps/secure-api",
      }),
    ).toEqual({
      v: 1,
      managed: true,
      ext: "@owner/mcps/secure-api",
      source: "registry",
      ref: "@owner/mcps/secure-api",
    });
    expect(buildAxmMcpMetadataFromSettingsSource("@owner/mcps/secure-api", "secure-api")).toEqual({
      v: 1,
      managed: true,
      ext: "@owner/mcps/secure-api",
      source: "registry",
      ref: "@owner/mcps/secure-api",
    });
  });
});
