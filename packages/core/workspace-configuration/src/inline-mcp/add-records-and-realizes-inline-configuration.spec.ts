import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture } from "../testing.js";
import { runInlineMcpAdd } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/add/records-and-realizes-inline-configuration",
  title: "Adding an inline MCP server records it as authored configuration and realizes it",
  statement:
    "When an inline MCP server is added by command or url, AXM shall record it in axm.json as authored configuration, realize it in the native configuration of configured agents that can represent it, and report the applied change.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table"],
  derivedFrom: [
    "cli/mcps/inline-lifecycle-is-idempotent",
    "cli/mcps/projects-to-every-configured-agent",
    "cli/mcps/inline-entries-are-authoritative-as-authored",
    "packages/core/workspace-configuration/src/inline-mcp/add-inline-mcp-server.ts",
    "apps/cli/help/topics/mcps.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface InlineAddRow {
  readonly label: string;
  readonly command?: string;
  readonly url?: string;
  readonly env?: ReadonlyArray<string>;
  readonly headers?: ReadonlyArray<string>;
  /** The entry as it must appear in `axm.json` and in native configuration. */
  readonly authored: Readonly<Record<string, unknown>>;
}

const inlineAddRows: ReadonlyArray<InlineAddRow> = [
  {
    label: "a command server",
    command: "node server.js",
    authored: { command: "node", args: ["server.js"] },
  },
  {
    label: "a remote server",
    url: "https://example.test/mcp",
    authored: { url: "https://example.test/mcp" },
  },
  {
    label: "a command server with named environment inputs",
    command: "node server.js",
    env: ["CONTEXT_TOKEN", "MODE=review"],
    authored: {
      command: "node",
      args: ["server.js"],
      env: { CONTEXT_TOKEN: "${CONTEXT_TOKEN}", MODE: "review" },
    },
  },
  {
    label: "a remote server with repeated header inputs",
    url: "https://example.test/mcp",
    headers: ["X-Workspace:review-team", "Authorization:Bearer ${CONTEXT_TOKEN}"],
    authored: {
      url: "https://example.test/mcp",
      headers: { "X-Workspace": "review-team", Authorization: "Bearer ${CONTEXT_TOKEN}" },
    },
  },
];

describe("Add an inline MCP server", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(inlineAddRows)(
    "adding $label records it, realizes it, and records no resolution",
    (row) => {
      const fixture = makeConfigurationFixture({ settings: { agents: ["claude-code"] } });
      cleanups.push(fixture.cleanup);
      return fixture
        .provide(
          Effect.gen(function* () {
            const outcome = yield* runInlineMcpAdd(
              {
                name: "demo",
                ...(row.command === undefined ? {} : { command: row.command }),
                ...(row.url === undefined ? {} : { url: row.url }),
                env: row.env ?? [],
                headers: row.headers ?? [],
              },
              "apply",
            );

            expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
              mcpServers: { demo: row.authored },
            });
            const nativeConfig: unknown = JSON.parse(fixture.readFile(".mcp.json"));
            expect(nativeConfig).toMatchObject({
              mcpServers: { demo: expect.objectContaining(row.authored) },
            });
            expect(outcome).toMatchObject({
              outcome: "applied",
              resolution: { name: "Add MCP server" },
            });
            expect(
              "resolution" in outcome
                ? outcome.resolution.units.filter((unit) => unit.state === "committed").length
                : 0,
            ).toBe(2);
            // Inline configuration is authoritative — `cli/mcps/inline-entries-are-
            // authoritative-as-authored` owns that rule; this is its consequence here.
            expect(fixture.readFile("axm-lock.yaml")).not.toContain("demo");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
