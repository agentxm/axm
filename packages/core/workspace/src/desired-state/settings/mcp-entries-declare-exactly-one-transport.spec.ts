import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { SettingsSchema } from "./schema.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/entries-declare-exactly-one-transport",
  title: "MCP entries declare at most one of source, command, or url",
  statement:
    "An MCP server entry in axm.json shall declare at most one of source, command, or url; an entry declaring more than one shall be refused with an error naming that rule, and an entry declaring none shall be accepted only as a Pack-member configuration that sets at least one supported preference and no transport field, with any other source-less entry refused with an error naming the rule it broke.",
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
 * Ways a person can write an MCP entry that names more than one transport.
 * Each row is a document AXM must refuse rather than guess at.
 */
const multipleTransportRows = [
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

/**
 * An entry that names no transport configures a connection some Pack supplies.
 * It states preferences and nothing else: an empty object expresses no intent,
 * and a transport-shaped field belongs to a definition it is not making.
 */
const invalidConfigurationRows = [
  {
    label: "an entry with no transport and no preference",
    entry: {},
    message: "must declare a source or set at least one of enabled, env",
  },
  {
    label: "a source-less entry carrying stdio arguments",
    entry: { args: ["-y", "tool"], enabled: false },
    message: "cannot set args",
  },
  {
    label: "a source-less entry carrying remote headers",
    entry: { headers: { Authorization: "Bearer x" }, enabled: false },
    message: "cannot set headers",
  },
] as const;

const decodeSettings = Schema.decodeUnknownExit(SettingsSchema);

describe("MCP entries declare at most one transport", () => {
  it.each(multipleTransportRows)("$label is refused and the rule is named", (row) => {
    const outcome = decodeSettings({ mcpServers: { broken: row.entry } });

    expect(outcome._tag).toBe("Failure");
    expect(String(outcome)).toContain("exactly one of source, command, or url");
  });

  it.each(invalidConfigurationRows)("$label is refused and the rule is named", (row) => {
    const outcome = decodeSettings({ mcpServers: { broken: row.entry } });

    expect(outcome._tag).toBe("Failure");
    expect(String(outcome)).toContain(row.message);
  });

  it("an entry naming exactly one transport is accepted", () => {
    const outcome = decodeSettings({
      mcpServers: { context: { source: "@acme/mcps/tool@^1.0.0" } },
    });

    expect(outcome._tag).toBe("Success");
  });

  it("a source-less entry that only states preferences is accepted", () => {
    const outcome = decodeSettings({
      mcpServers: { context: { enabled: false, env: { TOKEN: "${TOKEN}" } } },
    });

    expect(outcome._tag).toBe("Success");
  });
});
