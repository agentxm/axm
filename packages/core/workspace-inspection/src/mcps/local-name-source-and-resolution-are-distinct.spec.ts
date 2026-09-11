import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { makeRegistryMcpServerLockEntry } from "@agentxm/workspace-state/testing";

import { mcpServerListDocument } from "../type-list/mcp-servers.js";
import { listMcpServers } from "../type-list/type-lists.js";
import { inspectionRegistryUrl, makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/list/local-name-source-and-resolution-are-distinct",
  title: "The machine MCP inventory distinguishes local connection identity from source resolution",
  statement:
    "When MCP servers are listed in machine output, AXM shall report each connection's local name, its source, and its accepted resolution as distinct fields, so that connections sharing one source remain individually identifiable, and shall report every configured agent's outcome for the connection — naming an agent that cannot represent it as unsupported rather than omitting it.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "agent-interoperability"],
  methods: ["example", "contract"],
  derivedFrom: [
    "packages/core/workspace-inspection/src/type-list/mcp-servers.ts",
    // The reconciliation half of the every-agent rule — what actually reaches
    // each agent's native configuration — is cli/mcps/projects-to-every-configured-agent.
    "cli/mcps/projects-to-every-configured-agent",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Both connections share one accepted resolution, keyed by the shared identity. */
const sharedIdentity = `registry:${encodeURIComponent(inspectionRegistryUrl)}:@acme/mcps/context`;
const acceptedResolution = makeRegistryMcpServerLockEntry({
  owner: decodeHandleSync("@acme"),
  name: "context",
  endpoint: new URL(inspectionRegistryUrl),
});

describe("List locally named MCP connections as a machine document", () => {
  it.effect("emits discriminated local, source, and resolution fields", () => {
    // Two local connections accept the same published MCP server.
    const fixture = makeInspectionFixture({
      settings: {
        sources: [{ name: "agentxm", type: "registry", location: inspectionRegistryUrl }],
        mcpServers: {
          "work-context": { source: "agentxm:@acme/mcps/context", enabled: true },
          "personal-context": { source: "agentxm:@acme/mcps/context", enabled: true },
        },
      },
      lockfile: { mcpServers: { [sharedIdentity]: acceptedResolution } },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const { inventory, rows } = yield* listMcpServers();
          const document = mcpServerListDocument({ inventory, rows });
          expect(document.count).toBe(2);
          expect(document.items.map((item) => item.localName).sort()).toEqual([
            "personal-context",
            "work-context",
          ]);
          for (const item of document.items) {
            expect(item.source).toMatchObject({
              kind: "registry",
              locator: "agentxm:@acme/mcps/context",
              identity: expect.stringContaining("@acme/mcps/context"),
            });
            expect(item.resolution).toMatchObject({
              kind: "registry",
              version: "1.0.0",
              integrity: "sha512-AAAA==",
            });
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});

/**
 * One projected MCP entry exactly as reconciliation leaves it in an agent's
 * own configuration file, management marker included.
 */
const projectedNativeConfig = `${JSON.stringify(
  {
    mcpServers: {
      demo: {
        "x-axm": { v: 1, managed: true, ext: "@workspace/mcps/demo", source: "inline" },
        type: "stdio",
        command: "node",
        args: ["server.js"],
      },
    },
  },
  null,
  2,
)}\n`;

/**
 * Every configured agent is accounted for: the two that carry the connection
 * report `current`, and the one catalogued without MCP support reports
 * `unsupported` rather than dropping out of the inventory.
 */
const agentOutcomeRows = [
  { agentId: "claude-code", outcome: "current" },
  { agentId: "cursor", outcome: "current" },
  { agentId: "amp", outcome: "unsupported" },
] as const;

describe("Report every configured agent's outcome for a connection", () => {
  for (const row of agentOutcomeRows)
    it.effect(`reports ${row.agentId} as ${row.outcome} instead of omitting it`, () => {
      const fixture = makeInspectionFixture({
        settings: {
          agents: agentOutcomeRows.map((entry) => entry.agentId),
          mcpServers: { demo: { command: "node", args: ["server.js"] } },
        },
        files: {
          ".mcp.json": projectedNativeConfig,
          ".cursor/mcp.json": projectedNativeConfig,
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const { inventory, rows } = yield* listMcpServers();
            const document = mcpServerListDocument({ inventory, rows });
            const item = document.items.find((candidate) => candidate.localName === "demo");
            expect(item).toBeDefined();
            const outcomes = item?.agentOutcomes ?? [];

            expect(outcomes.map((outcome) => outcome.agentId).sort()).toEqual(
              agentOutcomeRows.map((entry) => entry.agentId).sort(),
            );
            expect(outcomes.find((outcome) => outcome.agentId === row.agentId)?.outcome).toBe(
              row.outcome,
            );
            expect(outcomes.map((outcome) => outcome.outcome)).not.toContain("not-applicable");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
