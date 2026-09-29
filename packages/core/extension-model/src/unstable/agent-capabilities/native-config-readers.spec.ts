import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { AGENTS, AGENTS_BY_ID, McpExtensionCapabilitySchema } from "./index.js";

export const specification = defineSpecification({
  requirement: "agents/catalog/native-config-readers-are-independent",
  title: "Native configuration readers remain distinct from AXM writer support",
  statement:
    "AXM shall expose documented native configuration locations independently of writer support, declare scope, root, file shape, conditions, and evidence for each location, represent unknown locations without inventing paths, and require writer selections to reference canonical native declarations and native entry dialects without duplicating those contracts.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("independent native configuration readers", () => {
  const decode = Schema.decodeUnknownSync(McpExtensionCapabilitySchema, {
    onExcessProperty: "error",
  });
  it("retains known readers when AXM cannot write them", () => {
    const original = AGENTS_BY_ID.cursor.capabilities["mcp-server"];
    const capability = decode({
      ...original,
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "The current writer cannot preserve this configuration.",
      },
    });
    expect(capability.native).toEqual(original.native);
    expect(capability.axm.writer).toBeNull();
  });
  it("records OpenCode's documented nested MCP readers and XDG root without inventing a writer", () => {
    const capability = decode(AGENTS_BY_ID.opencode.capabilities["mcp-server"]);
    expect(capability.axm.writer).toBeNull();
    expect(capability.native).toMatchObject({
      entryDialect: null,
      locations: expect.arrayContaining([
        expect.objectContaining({
          scope: "user",
          root: "xdg-config",
          path: "opencode/opencode.json",
          keyPath: ["mcp", "servers"],
        }),
        expect.objectContaining({
          scope: "project",
          root: "project",
          path: ".opencode/opencode.jsonc",
          format: "jsonc",
          keyPath: ["mcp", "servers"],
        }),
      ]),
    });
  });
  it("keeps unknown native locations distinct from unavailable native capability", () => {
    const original = AGENTS_BY_ID.cursor.capabilities["mcp-server"];
    const capability = decode({
      ...original,
      native: { ...original.native, locations: [] },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "Native location is not verified.",
      },
    });
    expect(capability.native).toMatchObject({
      availability: { via: "native" },
      scopes: ["user", "project"],
      locations: [],
    });
  });
  it("keeps verified entry semantics when a native reader has no AXM writer", () => {
    const original = AGENTS_BY_ID["github-copilot-cli"].capabilities["mcp-server"];
    const capability = decode({
      ...original,
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "Native reading remains known independently of this writer.",
      },
    });
    expect(capability.native).toMatchObject({ entryDialect: original.native.entryDialect });
    expect(original.axm.writer?.config).toEqual({ locationIds: ["user", "project"] });
  });
  it("refuses a writer that names a location absent from native evidence", () => {
    const capability = AGENTS_BY_ID.cursor.capabilities["mcp-server"];
    if (capability.axm.writer === null) throw new Error("Cursor writer fixture is required");
    expect(() =>
      decode({
        ...capability,
        axm: {
          ...capability.axm,
          writer: {
            config: {
              ...capability.axm.writer.config,
              locationIds: ["undeclared-location"],
            },
          },
        },
      }),
    ).toThrow("declared native config location ids");
  });
  it("keeps every supported writer path in exactly one scoped declaration", () => {
    for (const agent of AGENTS) {
      const capability = agent.capabilities["mcp-server"];
      if (capability.axm.writer === null || !("locations" in capability.native)) continue;
      for (const id of capability.axm.writer.config.locationIds) {
        const declarations = capability.native.locations.filter((location) => location.id === id);
        expect(declarations, `${agent.id}:${id}`).toHaveLength(1);
        expect(declarations[0]).toMatchObject({ shape: "file" });
        expect(declarations[0]?.keyPath).toHaveLength(1);
        expect(declarations[0]?.path.startsWith("~/")).toBe(false);
      }
    }
  });
});
