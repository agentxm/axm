import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { SettingsSchema } from "./schema.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/entries-declare-exactly-one-transport",
  title: "MCP entries declare exactly one of source, command, or url",
  statement:
    "An MCP server entry in axm.json shall declare exactly one of source, command, or url, and a document declaring none or more than one shall be refused with an error naming that rule.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "Transport exclusivity is a property of the accepted settings document; the decode that refuses it is the lowest layer that decides the rule.",
  methods: ["decision-table"],
  derivedFrom: [
    "cli/mcps/inline-authority-is-operation-coherent",
    "cli/invalid-workspace-state-gates-operations",
  ],
  supersedes: ["cli/mcps/inline-authority-is-operation-coherent"],
  assumptions: [],
  openQuestions: [],
});

/**
 * Ways a person can write an MCP entry that names no transport, or more than
 * one. Each row is a document AXM must refuse rather than guess at.
 */
const invalidEntryRows = [
  { label: "an entry with no source, command, or url", entry: {} },
  {
    label: "an entry with both command and url",
    entry: { command: "echo x", url: "https://example.test/mcp" },
  },
  {
    label: "an entry with both source and command",
    entry: { source: "@acme/mcps/tool@^1.0.0", command: "echo x" },
  },
  {
    label: "an entry with both source and url",
    entry: { source: "@acme/mcps/tool@^1.0.0", url: "https://example.test/mcp" },
  },
] as const;

const decodeSettings = Schema.decodeUnknownExit(SettingsSchema);

describe("MCP entries declare exactly one transport", () => {
  it.each(invalidEntryRows)("$label is refused and the rule is named", (row) => {
    const outcome = decodeSettings({ mcpServers: { broken: row.entry } });

    expect(outcome._tag).toBe("Failure");
    expect(String(outcome)).toContain("exactly one of source, command, or url");
  });

  it("an entry naming exactly one transport is accepted", () => {
    const outcome = decodeSettings({
      mcpServers: { context: { source: "@acme/mcps/tool@^1.0.0" } },
    });

    expect(outcome._tag).toBe("Success");
  });
});
