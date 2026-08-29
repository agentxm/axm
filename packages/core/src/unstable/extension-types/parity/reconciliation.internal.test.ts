import { describe, expect, it } from "vitest";
import { extensionTypes } from "../../extensions/common.js";
import {
  RECONCILIATION_SOURCE_CLASSES,
  WORKSPACE_RECONCILIATION_OBLIGATIONS,
} from "./reconciliation.js";

describe("workspace reconciliation parity obligations", () => {
  it("covers every extension type, including pack", () => {
    expect(Object.keys(WORKSPACE_RECONCILIATION_OBLIGATIONS).sort()).toEqual(
      [...extensionTypes].sort(),
    );
  });

  it("names support or non-applicability for every source class", () => {
    for (const [type, obligation] of Object.entries(WORKSPACE_RECONCILIATION_OBLIGATIONS)) {
      expect(Object.keys(obligation.sources).sort(), `${type} source applicability`).toEqual(
        [...RECONCILIATION_SOURCE_CLASSES].sort(),
      );
    }
  });

  it("models pack as a container and inline MCP without fake canonical content", () => {
    const obligations = Object.values(WORKSPACE_RECONCILIATION_OBLIGATIONS);
    const pack = obligations.find((obligation) => obligation.canonical === "pack-manifest");
    const inline = obligations.find(
      (obligation) => obligation.canonical === "package-or-inline-settings-and-native-config",
    );

    expect(pack).toMatchObject({
      canonical: "pack-manifest",
      projections: ["dependency graph"],
    });
    expect(inline?.sources.inline).toBe("supported");
    expect(inline?.projections).toContain("inline settings/native configuration");
  });
});
