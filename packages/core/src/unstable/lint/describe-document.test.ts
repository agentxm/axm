import { describe, expect, it } from "@effect/vitest";
import { extensionTypes } from "../extensions/common.js";
import { LOCKFILE_NAME } from "../lockfile/lockfile.js";
import { MANIFEST_FILENAME_BY_TYPE } from "../publish/manifest-policy.js";
import { SETTINGS_FILENAME } from "../settings/settings.js";
import { describeSchemaDocument, UNKNOWN_DOCUMENT_LABEL } from "./describe-document.js";

describe("describeSchemaDocument", () => {
  it("labels every extension type's manifest", () => {
    for (const type of extensionTypes) {
      const label = describeSchemaDocument(MANIFEST_FILENAME_BY_TYPE[type]);
      expect(label, `${type} manifest label`).not.toBe(UNKNOWN_DOCUMENT_LABEL);
      expect(label).toMatch(/ manifest$/);
    }
  });

  it("labels the workspace documents", () => {
    expect(describeSchemaDocument(SETTINGS_FILENAME)).toBe("Workspace settings");
    expect(describeSchemaDocument(LOCKFILE_NAME)).toBe("Lockfile");
  });

  it("keys by basename so workspace-relative paths resolve", () => {
    expect(describeSchemaDocument(`.axm/${SETTINGS_FILENAME}`)).toBe("Workspace settings");
    expect(describeSchemaDocument(`.axm\\${LOCKFILE_NAME}`)).toBe("Lockfile");
  });

  it("falls back to the unknown-document label", () => {
    expect(describeSchemaDocument("package.json")).toBe(UNKNOWN_DOCUMENT_LABEL);
    expect(describeSchemaDocument("")).toBe(UNKNOWN_DOCUMENT_LABEL);
  });

  it("uses the sentence-cased type label", () => {
    expect(describeSchemaDocument("mcp.json")).toBe("MCP server manifest");
    expect(describeSchemaDocument("knowledge.json")).toBe("Knowledge bundle manifest");
    expect(describeSchemaDocument("rule.json")).toBe("Rule manifest");
  });
});
