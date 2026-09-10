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
    "When MCP servers are listed in machine output, AXM shall report each connection's local name, its source, and its accepted resolution as distinct fields, so that connections sharing one source remain individually identifiable.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics", "agent-interoperability"],
  methods: ["example", "contract"],
  derivedFrom: ["packages/core/workspace-inspection/src/type-list/mcp-servers.ts"],
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
