import { describe, expect, it } from "vitest";
import {
  deleteYamlEntry,
  managedYamlNames,
  parseYaml,
  readYamlEntry,
  setYamlEntry,
  setYamlScalar,
} from "./index.js";

const managedInline = {
  managed: true,
  source: "inline",
};

describe("yaml utilities", () => {
  it("creates a config document from an empty file", () => {
    const raw = setYamlEntry("", "mcp_servers", "context", {
      "x-axm": managedInline,
      command: "npx",
      args: ["-y", "@acme/context-mcp"],
      env: { ACME_TOKEN: "secret" },
    });

    expect(parseYaml(raw)).toMatchObject({
      mcp_servers: {
        context: {
          command: "npx",
          args: ["-y", "@acme/context-mcp"],
          env: { ACME_TOKEN: "secret" },
          "x-axm": managedInline,
        },
      },
    });
  });

  it("merges into an existing map while preserving comments and unknown keys", () => {
    const existing = [
      "# keep top",
      "model: hermes-4",
      "# keep servers",
      "mcp_servers:",
      "  # user-owned",
      "  filesystem:",
      "    command: npx",
      "    timeout: 30",
      "",
    ].join("\n");

    const raw = setYamlEntry(existing, "mcp_servers", "context", {
      "x-axm": managedInline,
      command: "npx",
    });

    expect(raw).toContain("# keep top");
    expect(raw).toContain("# keep servers");
    expect(raw).toContain("# user-owned");
    expect(raw).toContain("timeout: 30");
    expect(readYamlEntry(raw, "mcp_servers", "filesystem")).toMatchObject({
      command: "npx",
      timeout: 30,
    });
    expect(readYamlEntry(raw, "mcp_servers", "context")).toMatchObject({
      command: "npx",
      "x-axm": managedInline,
    });
  });

  it("deletes one entry without removing user-authored servers", () => {
    const raw = [
      "mcp_servers:",
      "  filesystem:",
      "    command: npx",
      "  context:",
      "    x-axm:",
      "      managed: true",
      "      source: inline",
      "    command: npx",
      "",
    ].join("\n");

    const next = deleteYamlEntry(raw, "mcp_servers", "context");

    expect(readYamlEntry(next, "mcp_servers", "context")).toBeUndefined();
    expect(readYamlEntry(next, "mcp_servers", "filesystem")).toMatchObject({
      command: "npx",
    });
  });

  it("sets scalar values in nested entries", () => {
    const raw = [
      "mcp_servers:",
      "  context:",
      "    x-axm:",
      "      managed: true",
      "      source: inline",
      "    command: npx",
      "    enabled: true",
      "",
    ].join("\n");

    const next = setYamlScalar(raw, ["mcp_servers", "context", "enabled"], false);

    expect(readYamlEntry(next, "mcp_servers", "context")).toMatchObject({
      enabled: false,
    });
  });

  it("collects only managed server names", () => {
    const raw = [
      "mcp_servers:",
      "  filesystem:",
      "    command: npx",
      "  context:",
      "    x-axm:",
      "      managed: true",
      "      source: inline",
      "    command: npx",
      "",
    ].join("\n");

    expect(managedYamlNames(raw, "mcp_servers", (entry) => entry["x-axm"] !== undefined)).toEqual([
      "context",
    ]);
  });

  it("rejects configs whose servers key is not a mapping", () => {
    expect(() => setYamlEntry("mcp_servers: []\n", "mcp_servers", "context", {})).toThrow(
      "mcp_servers must be a mapping",
    );
  });
});
