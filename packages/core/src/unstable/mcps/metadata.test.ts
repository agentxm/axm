import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  AxmMcpMetadataSchema,
  buildAxmMcpMetadata,
  buildAxmMcpMetadataFromSettingsSource,
  isAxmManagedMcpEntry,
  readAxmMcpMetadata,
} from "./metadata.js";

const decodeMetadata = Schema.decodeUnknownSync(AxmMcpMetadataSchema);

describe("AXM MCP metadata", () => {
  it("builds inline metadata without a ref", () => {
    expect(buildAxmMcpMetadataFromSettingsSource("inline")).toEqual({
      managed: true,
      source: "inline",
    });
  });

  it("builds registry metadata with a resolvable ref", () => {
    expect(buildAxmMcpMetadata({ source: "registry", ref: "@owner/mcps/secure-api" })).toEqual({
      managed: true,
      source: "registry",
      ref: "@owner/mcps/secure-api",
    });
    expect(buildAxmMcpMetadataFromSettingsSource("@owner/mcps/secure-api")).toEqual({
      managed: true,
      source: "registry",
      ref: "@owner/mcps/secure-api",
    });
  });

  it("validates ref presence by source", () => {
    expect(decodeMetadata({ managed: true, source: "inline" })).toEqual({
      managed: true,
      source: "inline",
    });
    expect(
      Option.isNone(
        readAxmMcpMetadata({
          "x-axm": { managed: true, source: "inline", ref: "ignored" },
        }),
      ),
    ).toBe(true);
    expect(() => decodeMetadata({ managed: true, source: "registry" })).toThrow();
  });

  it("detects only entries with a valid managed metadata envelope", () => {
    expect(
      isAxmManagedMcpEntry({
        "x-axm": { managed: true, source: "inline" },
      }),
    ).toBe(true);
    expect(isAxmManagedMcpEntry({ managedBy: "axm" })).toBe(false);
    expect(
      isAxmManagedMcpEntry({
        "x-axm": { managed: false, source: "inline" },
      }),
    ).toBe(false);
    expect(Option.isNone(readAxmMcpMetadata({}))).toBe(true);
  });
});
