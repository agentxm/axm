import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  SettingsSchema,
  McpServerLockEntrySchema,
  evaluateDesiredState,
  acceptedRowKey,
  desiredReachesAcceptedRow,
  mcpResolutionKey,
  type McpServerLockEntry,
} from "../index.js";

export const specification = defineSpecification({
  requirement: "workspace/mcps/external-resolutions-remain-reachable",
  title: "External MCP connections retain their exact accepted source resolution",
  statement:
    "AXM shall bind a Git or local MCP connection to an accepted resolution only when its source authority and declared locator identify one exact accepted package, retain that row while the connection remains desired, and use its accepted package identity for native ownership proof.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const accepted = (source: unknown): McpServerLockEntry =>
  Schema.decodeUnknownSync(McpServerLockEntrySchema)({
    source,
    identity: { owner: "@acme", name: "context" },
    resolved: {
      tree: `sha256-tree-v2:${"0".repeat(64)}`,
      ...(typeof source === "object" && source !== null && "type" in source && source.type === "git"
        ? { commit: "commit" }
        : {}),
    },
    treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
  });

const evaluate = (source: string, rows: Readonly<Record<string, McpServerLockEntry>>) =>
  evaluateDesiredState({
    scope: "project",
    settings: Schema.decodeUnknownSync(SettingsSchema)({
      mcpServers: { "local-alias": { kind: "sourced", source, bindings: [], enabled: true } },
    }),
    inheritedSettings: Schema.decodeUnknownSync(SettingsSchema)({}),
    defaultRegistry: "test",
    registryEndpoints: {},
    acceptedResolutions: { lockfileVersion: 11, skills: {}, mcpServers: rows },
    packDocuments: [],
    readSet: [],
  });

describe("accepted external MCP source identity", () => {
  for (const row of [
    { source: { type: "path", path: "vendor/context" }, locator: "./vendor/context" },
    {
      source: {
        type: "git",
        url: "https://github.com/acme/extensions.git",
        path: "mcps/context",
        revision: "main",
      },
      locator: "github:acme/extensions//mcps/context@main",
    },
  ])
    it(`retains exact ${row.source.type} authority for a local connection alias`, () => {
      const entry = accepted(row.source);
      const key = mcpResolutionKey(entry);
      const graph = evaluate(row.locator, { [key]: entry });
      const node = graph.nodes.find((candidate) => candidate.name === "local-alias");
      if (node === undefined) return expect.fail("Expected the desired connection");
      expect(acceptedRowKey(node)).toEqual(Option.some(key));
      expect(node.identity).toMatchObject({ fqn: "@acme/mcps/context", resolutionKey: key });
      expect(desiredReachesAcceptedRow(graph, { type: "mcp-server", key })).toBe(true);
    });

  it("does not bind a wrong source or a mismatched accepted key", () => {
    const entry = accepted({ type: "path", path: "vendor/context" });
    for (const graph of [
      evaluate("./elsewhere/context", { [mcpResolutionKey(entry)]: entry }),
      evaluate("./vendor/context", { wrong: entry }),
    ]) {
      const node = graph.nodes[0];
      if (node === undefined) return expect.fail("Expected the unresolved connection");
      expect(acceptedRowKey(node)).toEqual(Option.none());
      expect(node.identity).not.toHaveProperty("fqn");
    }
  });
});
