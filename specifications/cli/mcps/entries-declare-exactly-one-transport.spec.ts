import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/entries-declare-exactly-one-transport",
  title: "MCP entries declare exactly one of source, command, or url",
  statement:
    "An MCP server entry in axm.json shall declare exactly one of source, command, or url, and a workspace operation that reads an entry declaring none or more than one shall reject it before any workspace change with an error naming that rule.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table"],
  derivedFrom: ["cli/mcps/inline-authority-is-operation-coherent"],
  supersedes: ["cli/mcps/inline-authority-is-operation-coherent"],
  assumptions: [
    "Sync stands for every workspace operation that reads MCP entries, because settings are validated once before any operation begins.",
  ],
  openQuestions: [],
});

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

describe("MCP entries declare exactly one transport", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(invalidEntryRows)("$label is rejected before any workspace change", (row) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { mcps: { broken: row.entry } },
      });
      cleanups.push(workspace.cleanup);
      const settingsBefore = workspace.readFile("axm.json");
      const lockBefore = workspace.readLockfileText();

      const failure = yield* handleSync({ preview: false }).pipe(
        Effect.provide(workspace.layer),
        Effect.flip,
      );

      const error = getAppError(failure);
      expect(error.detail).toContain("exactly one of source, command, or url");
      expect(workspace.rendererState.results).toEqual([]);
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readLockfileText()).toBe(lockBefore);
      expect(workspace.exists(".mcp.json")).toBe(false);
    }),
  );
});
