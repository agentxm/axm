import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { authoringTypes, readPackageJson } from "../../../support/authoring-fixtures.js";
import { createNewExtension } from "../../../support/new-extension-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/new/creates-enabled-workspace-content",
  title: "Creating an MCP server records editable workspace content",
  statement:
    "When a person creates an MCP server, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/mcps/new.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Creating an MCP server", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("creates editable content and an enabled workspace declaration", () =>
    Effect.gen(function* () {
      const created = workspace({ settings: { agents: ["claude-code"] } });
      const row = authoringTypes.find((item) => item.type === "mcp-server");
      if (row === undefined) throw new Error("Required type row missing");
      yield* createNewExtension(row, "review").pipe(Effect.provide(created.layer));
      expect(readPackageJson(created.root, "mcps/review/mcp.json")).toMatchObject({
        owner: "@acme",
        type: "mcp-server",
        name: "review",
        ...{
          description: "Workspace server",
          server: {
            description: "Workspace server",
            packages: [expect.objectContaining({ transport: { type: "stdio" } })],
          },
        },
      });
      expect(created.readSettings()).toMatchObject({
        [row.settingsKey]: { review: "workspace" },
      });
      expect(JSON.stringify(created.readSettings())).not.toContain('"enabled":false');
    }),
  );
});
