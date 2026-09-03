import { createRequire } from "node:module";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { SettingsSchema } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "settings-contract/agent-membership-is-the-only-agent-selection",
  title: "Workspace settings select agents only through the workspace agent list",
  statement:
    "Workspace settings shall express agent selection only through the workspace agent list, shall reject an extension entry that declares its own agent subset with an error naming that key, and the published settings schema shall admit no per-entry agent subset.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["example", "contract"],
  derivedFrom: [
    "settings-contract/published-schemas-agree-with-accepted-input",
    "cli/settings-validity-gates-operations",
    "packages/workspace-state/src/settings/schema.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [
    "The schema documents shipped as package site content are the same documents published at the public schema URLs that editors and automation fetch.",
    "The product reads settings with excess keys treated as errors, so decoding here with the same option observes the product's acceptance boundary.",
  ],
  openQuestions: [],
});

const requireFromSpec = createRequire(import.meta.url);
const decodeJsonRecord = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));

const readPublishedSchema = (name: string): Record<string, unknown> => {
  const loaded: unknown = requireFromSpec(`axm.sh/unstable/site-content/schemas/${name}`);
  return decodeJsonRecord(loaded);
};

const child = (parent: Record<string, unknown>, key: string): Record<string, unknown> =>
  decodeJsonRecord(parent[key]);

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

/**
 * Walks one schema definition and reports whether any object inside it
 * declares a property named `agents`.
 */
const declaresAgentsProperty = (node: unknown): boolean => {
  if (Array.isArray(node)) {
    return node.some(declaresAgentsProperty);
  }
  if (typeof node !== "object" || node === null) {
    return false;
  }
  const record: Record<string, unknown> = decodeJsonRecord(node);
  const properties = record["properties"];
  if (typeof properties === "object" && properties !== null && "agents" in properties) {
    return true;
  }
  return Object.values(record).some(declaresAgentsProperty);
};

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

describe("Published settings schema", () => {
  it.effect("only the workspace settings document declares an agents property", () =>
    Effect.sync(() => {
      const definitions = child(readPublishedSchema("settings.schema.json"), "definitions");
      const owners = Object.entries(definitions)
        .filter(([, definition]) => declaresAgentsProperty(definition))
        .map(([name]) => name);
      expect(owners).toEqual(["AxmSettings"]);
    }),
  );
});
