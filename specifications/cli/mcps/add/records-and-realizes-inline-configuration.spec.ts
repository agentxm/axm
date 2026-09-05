import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { expectAppliedPlanResult, handleMcpsAdd } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/add/records-and-realizes-inline-configuration",
  title: "Adding an inline MCP server records it as authored configuration and realizes it",
  statement:
    "When an inline MCP server is added by command or url, AXM shall record it in axm.json as authored configuration, realize it in the native configuration of configured agents, report the applied change, and shall record no accepted resolution.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table"],
  derivedFrom: ["cli/mcps/inline-lifecycle-is-idempotent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

interface InlineAddRow {
  readonly label: string;
  readonly command: Option.Option<string>;
  readonly url: Option.Option<string>;
  /** The entry as it must appear in `axm.json` and in native configuration. */
  readonly authored: Readonly<Record<string, unknown>>;
}

const inlineAddRows: ReadonlyArray<InlineAddRow> = [
  {
    label: "a command server",
    command: Option.some("node server.js"),
    url: Option.none(),
    authored: { command: "node", args: ["server.js"] },
  },
  {
    label: "a remote server",
    command: Option.none(),
    url: Option.some("https://example.test/mcp"),
    authored: { url: "https://example.test/mcp" },
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
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);

        yield* handleMcpsAdd({
          name: "demo",
          command: row.command,
          url: row.url,
          env: [],
          header: [],
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expect(workspace.readSettings()).toMatchObject({ mcpServers: { demo: row.authored } });
        const nativeConfig: unknown = JSON.parse(workspace.readFile(".mcp.json"));
        expect(nativeConfig).toMatchObject({
          mcpServers: { demo: expect.objectContaining(row.authored) },
        });
        expectAppliedPlanResult(workspace.rendererState.results[0]?.data, {
          planName: "Add MCP server",
          totalSteps: 2,
          appliedCount: 2,
        });
        // Inline configuration is authoritative — no accepted resolution is recorded.
        expect(workspace.readLockfileText()).not.toContain("demo");
      }),
  );
});
