import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  EXTENSION_TYPES,
  EXTENSION_TYPES_BY_ID,
  ExtensionTypeCatalogSchema,
  LEAF_EXTENSION_TYPES,
  getExtensionTypeDefinition,
  getStandardForExtensionType,
  isSpecTracked,
} from "./index.js";

describe("extension type catalog", () => {
  it("decodes the complete catalog through the schema", () => {
    const decoded = Schema.decodeUnknownSync(ExtensionTypeCatalogSchema)(EXTENSION_TYPES_BY_ID, {
      onExcessProperty: "error",
    });

    expect(Object.keys(decoded).sort()).toEqual([...LEAF_EXTENSION_TYPES].sort());
    expect(EXTENSION_TYPES.map((entry) => entry.id).sort()).toEqual(
      [...LEAF_EXTENSION_TYPES].sort(),
    );
  });

  it("tracks standards only for standard-backed extension types", () => {
    expect(getStandardForExtensionType("skill")?.id).toBe("agent-skills");
    expect(getStandardForExtensionType("mcp-server")?.id).toBe("mcp");
    expect(getStandardForExtensionType("rule")?.id).toBe("agents-md");
    expect(getStandardForExtensionType("files")).toBe(null);
    expect(getStandardForExtensionType("command")).toBe(null);
    expect(getStandardForExtensionType("subagent")).toBe(null);
    expect(getStandardForExtensionType("hook")).toBe(null);
  });

  it("derives spec-tracked status from catalog standard presence", () => {
    expect(isSpecTracked("skill")).toBe(true);
    expect(isSpecTracked("mcp-server")).toBe(true);
    expect(isSpecTracked("rule")).toBe(true);
    expect(isSpecTracked("files")).toBe(false);
  });

  it("documents rule and files as distinct markdown capabilities", () => {
    expect(getExtensionTypeDefinition("rule").description).toContain(
      "behavior-governing instructions",
    );
    expect(getExtensionTypeDefinition("files").description).toContain("Context material");
  });
});
