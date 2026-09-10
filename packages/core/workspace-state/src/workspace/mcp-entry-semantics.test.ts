import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  AxmMcpMetadataSchema,
  isAxmManagedMcpEntry,
  readAxmMcpMetadata,
} from "./mcp-entry-semantics.js";

const decodeMetadata = Schema.decodeUnknownSync(AxmMcpMetadataSchema);

describe("AXM MCP metadata semantics", () => {
  it("validates ref presence by source", () => {
    expect(
      decodeMetadata({ v: 1, managed: true, ext: "@workspace/mcps/linear", source: "inline" }),
    ).toEqual({
      v: 1,
      managed: true,
      ext: "@workspace/mcps/linear",
      source: "inline",
    });
    expect(
      Option.isNone(
        readAxmMcpMetadata({
          "x-axm": {
            v: 1,
            managed: true,
            ext: "@workspace/mcps/linear",
            source: "inline",
            ref: "ignored",
          },
        }),
      ),
    ).toBe(true);
    expect(() =>
      decodeMetadata({
        v: 1,
        managed: true,
        ext: "@owner/mcps/secure-api",
        source: "registry",
      }),
    ).toThrow();
  });

  it("detects only entries with a valid managed metadata envelope", () => {
    expect(
      isAxmManagedMcpEntry({
        "x-axm": {
          v: 1,
          managed: true,
          ext: "@workspace/mcps/linear",
          source: "inline",
        },
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
