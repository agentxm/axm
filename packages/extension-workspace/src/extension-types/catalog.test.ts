import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  BODY_GOVERNED_EXTENSION_TYPES,
  EXTENSION_TYPE_TABLE,
  INPUT_EXTENSION_TYPES,
  PER_AGENT_EXTENSION_TYPES,
  REGISTRY_EXTENSION_TYPES,
  WORKSPACE_EXTENSION_TYPES,
  extensionTypes,
} from "@agentxm/extension-model/unstable/extensions/common";
import { EXTENSION_TYPES, EXTENSION_TYPES_BY_ID } from "./catalog.js";
import {
  getExtensionTypeDefinition,
  getStandardForExtensionType,
  isSpecTracked,
} from "./derive.js";
import {
  ExtensionTypeCatalogSchema,
  CATALOG_EXTENSION_TYPES,
} from "@agentxm/extension-model/unstable/extension-types";

describe("extension type catalog", () => {
  it("decodes the complete catalog through the schema", () => {
    const decoded = Schema.decodeUnknownSync(ExtensionTypeCatalogSchema)(EXTENSION_TYPES_BY_ID, {
      onExcessProperty: "error",
    });

    expect(Object.keys(decoded).sort()).toEqual([...CATALOG_EXTENSION_TYPES].sort());
    expect(EXTENSION_TYPES.map((entry) => entry.id).sort()).toEqual(
      [...CATALOG_EXTENSION_TYPES].sort(),
    );
  });

  it("tracks standards only for standard-backed extension types", () => {
    expect(getStandardForExtensionType("skill")?.id).toBe("agent-skills");
    expect(getStandardForExtensionType("mcp-server")?.id).toBe("mcp");
    expect(getStandardForExtensionType("rule")?.id).toBe("agents-md");
    expect(getStandardForExtensionType("subagent")).toBe(null);
    expect(getStandardForExtensionType("hook")).toBe(null);
    expect(getStandardForExtensionType("knowledge")?.id).toBe("okf-0.2");
  });

  it("derives spec-tracked status from catalog standard presence", () => {
    expect(isSpecTracked("skill")).toBe(true);
    expect(isSpecTracked("mcp-server")).toBe(true);
    expect(isSpecTracked("rule")).toBe(true);
    expect(isSpecTracked("hook")).toBe(false);
  });

  it("gives every entry docs distinct from its governing standard", () => {
    for (const type of CATALOG_EXTENSION_TYPES) {
      const definition = EXTENSION_TYPES_BY_ID[type];
      expect(definition.docs.length).toBeGreaterThan(0);
      for (const doc of definition.docs) {
        expect(doc.url).not.toBe(definition.standard?.url);
      }
    }
  });

  it("agrees with the type table on which types a standard governs", () => {
    for (const type of CATALOG_EXTENSION_TYPES) {
      const governed = EXTENSION_TYPE_TABLE[type].governs !== null;
      expect(governed).toBe(EXTENSION_TYPES_BY_ID[type].standard !== null);
      expect(isSpecTracked(type)).toBe(governed);
    }
  });

  it("derives the axis arrays from the table in canonical order", () => {
    expect(PER_AGENT_EXTENSION_TYPES).toEqual(["skill", "mcp-server", "subagent", "hook"]);
    expect(WORKSPACE_EXTENSION_TYPES).toEqual(["rule", "knowledge"]);
    expect(REGISTRY_EXTENSION_TYPES).toEqual(extensionTypes.filter((type) => type !== "pack"));
    expect(INPUT_EXTENSION_TYPES).toEqual(["mcp-server"]);
    expect(BODY_GOVERNED_EXTENSION_TYPES).toEqual(["skill", "knowledge"]);
    expect(EXTENSION_TYPE_TABLE.pack.placement).toBe("container");
  });

  it("documents rules as behavior-governing instructions", () => {
    expect(getExtensionTypeDefinition("rule").description).toContain(
      "behavior-governing instructions",
    );
  });
});
