import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { runMcpImport } from "../inline-mcp/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/adoption-reaches-every-configured-agent",
  title: "An imported MCP server is adopted once and reaches every configured agent",
  statement:
    "When an MCP server found in one agent's native configuration is imported without --as, AXM shall record it once without an agent subset and shall report every native target it will write in preview and apply.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [
    "cli/mcps/inline-lifecycle-is-idempotent",
    "cli/mcps/projects-to-every-configured-agent",
    "cli/sync/realizes-desired-state",
    "packages/core/workspace-configuration/src/mcp-import/import-mcp-servers.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor keep distinct project-scope MCP configuration files, so a server present in one file and absent from the other observes adoption reaching a second agent.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Adoption is observed as far as the recorded entry and the native targets the import plan names. Whether the next reconciliation actually writes the imported server into every configured agent is not stated here: reconciliation is the workspace-sync feature, which a feature package may not import, so that clause holds only for authored inline entries under cli/mcps/projects-to-every-configured-agent.",
      retirementCondition:
        "Add an imported-server row to cli/mcps/projects-to-every-configured-agent, or restate the projection clause here once a workspace-sync testing port lets this package drive a reconciliation.",
    },
  ],
});

const CLAUDE_CODE_CONFIG = ".mcp.json";
const CURSOR_CONFIG = ".cursor/mcp.json";

const settingsEntry = (fixture: ConfigurationFixture, name: string): unknown => {
  const settings: unknown = JSON.parse(fixture.readFile("axm.json"));
  if (typeof settings !== "object" || settings === null || !("mcpServers" in settings)) {
    throw new Error("Expected axm.json with an mcpServers map");
  }
  const servers = settings.mcpServers;
  if (typeof servers !== "object" || servers === null || !(name in servers)) {
    throw new Error(`Expected axm.json to configure MCP server ${name}`);
  }
  return Object.entries(servers).find(([key]) => key === name)?.[1];
};

const targetPaths = (resolution: {
  readonly units: ReadonlyArray<{ readonly artifact?: { readonly targets?: unknown } }>;
}): ReadonlyArray<string> =>
  resolution.units.flatMap((unit) => {
    const targets = unit.artifact?.targets;
    return Array.isArray(targets)
      ? targets.flatMap((target: unknown) =>
          typeof target === "object" && target !== null && "path" in target
            ? [String(target.path)]
            : [],
        )
      : [];
  });

describe("Importing a natively configured MCP server", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "import records the server once, without an agent subset, on the same targets it previewed",
    () => {
      const fixture = makeConfigurationFixture({
        settings: { agents: ["claude-code", "cursor"] },
        files: {
          [CURSOR_CONFIG]: `${JSON.stringify(
            { mcpServers: { demo: { command: "node", args: ["server.js"] } } },
            null,
            2,
          )}\n`,
        },
      });
      cleanups.push(fixture.cleanup);
      return fixture
        .provide(
          Effect.gen(function* () {
            const previewed = yield* runMcpImport("preview");

            expect(previewed).toMatchObject({
              outcome: "previewed",
              resolution: { name: "Import MCP servers" },
            });
            expect(fs.existsSync(path.join(fixture.root, CLAUDE_CODE_CONFIG))).toBe(false);

            const applied = yield* runMcpImport("apply");

            expect(applied).toMatchObject({
              outcome: "applied",
              resolution: { name: "Import MCP servers" },
            });
            expect(targetPaths(applied.resolution)).toEqual(targetPaths(previewed.resolution));
            expect(targetPaths(applied.resolution)).toContain(CURSOR_CONFIG);
            const entry = settingsEntry(fixture, "demo");
            expect(entry).toMatchObject({ command: "node", args: ["server.js"] });
            expect(JSON.stringify(entry)).not.toContain('"agents"');
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
