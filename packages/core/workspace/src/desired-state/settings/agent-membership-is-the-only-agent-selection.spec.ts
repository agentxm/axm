import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { SettingsSchema } from "./schema.js";

export const specification = defineSpecification({
  requirement: "settings-contract/agent-membership-is-the-only-agent-selection",
  title: "Workspace settings select agents only through the workspace agent list",
  statement:
    "Workspace settings shall express agent selection only through the workspace agent list, and shall reject an extension entry that declares its own agent subset with an error naming that key.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["example", "contract"],
  derivedFrom: [
    "settings-contract/published-settings-schema-agrees-with-accepted-input",
    "cli/settings-validity-gates-operations",
  ],
  supersedes: [],
  assumptions: [
    "The product reads settings with excess keys treated as errors, so decoding here with the same option observes the product's acceptance boundary.",
  ],
  openQuestions: [],
});

/** Decodes the way the workspace reads its settings files: excess keys are errors. */
const decodeSettings = (input: unknown) =>
  Schema.decodeUnknownEffect(SettingsSchema)(input, { onExcessProperty: "error" });

const workspaceAgents = ["claude-code", "cursor"] as const;

const perEntrySelections = [
  {
    form: "sourced object",
    entry: { source: "@acme/mcps/context@^1.0.0", agents: ["claude-code"] },
    accepted: { source: "@acme/mcps/context@^1.0.0" },
  },
  {
    form: "inline command",
    entry: { command: "node", args: ["server.js"], agents: ["claude-code"] },
    accepted: { command: "node", args: ["server.js"] },
  },
  {
    form: "inline url",
    entry: { url: "https://mcp.example.com/sse", agents: ["claude-code"] },
    accepted: { url: "https://mcp.example.com/sse" },
  },
] as const;

describe("Per-entry agent selection is refused", () => {
  it.effect.each(perEntrySelections)(
    "an MCP $form entry declaring its own agent subset is rejected naming the key",
    (row) =>
      Effect.gen(function* () {
        const failure = yield* decodeSettings({
          agents: [...workspaceAgents],
          mcpServers: { demo: row.entry },
        }).pipe(Effect.flip);

        expect(String(failure)).toContain("agents");
        expect(String(failure)).toContain("demo");

        const accepted = yield* decodeSettings({
          agents: [...workspaceAgents],
          mcpServers: { demo: row.accepted },
        });
        expect(accepted.agents).toEqual([...workspaceAgents]);
        expect(JSON.stringify(accepted.mcpServers?.["demo"])).not.toContain('"agents"');
      }),
  );
});
