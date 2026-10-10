import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates } from "@agentxm/workspace-kernel/operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  writeLocalSkillPackage,
} from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-unowned-agent-content",
  title: "Sync preserves content outside declaration or ownership authority",
  statement:
    "For file artifacts outside native MCP and Hook declaration authority, sync shall retire or overwrite only content with AXM ownership proof and preserve hand-authored neighbors. For native MCP entries and Hook registrations, validated effective declarations shall authorize their exact units without a marker or adoption gate; sync shall preserve unselected native units and shall not prune registrations solely because their declarations disappear.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "code-review";
const HAND_AUTHORED = ".agents/skills/hand-authored/SKILL.md";

describe("Sync preserves unowned agent content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("removes owned universal residue while preserving a hand-authored neighbor", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: { [SKILL]: `./vendor/${SKILL}` },
      },
    });
    cleanups.push(workspace.cleanup);
    writeLocalSkillPackage(workspace.root, { name: SKILL });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(workspace.exists(`.agents/skills/${SKILL}`)).toBe(true);

          // A skill nobody declared, written by hand beside the one AXM owns.
          workspace.writeFile(HAND_AUTHORED, "# Authored by hand\n");
          workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], skills: {} });

          yield* applySync();

          expect(workspace.exists(`.agents/skills/${SKILL}`)).toBe(false);
          expect(workspace.readFile(HAND_AUTHORED)).toBe("# Authored by hand\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("replaces a declared unmarked MCP entry while preserving its native neighbors", () => {
    const initial = JSON.stringify(
      {
        custom: true,
        mcpServers: {
          demo: { command: "hand-written", args: [], obsolete: "stale-entry-field" },
          foreign: { command: "keep", args: [] },
        },
      },
      null,
      2,
    );
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        mcpServers: {
          demo: { connection: { transport: "stdio", command: "node", args: ["server.js"] } },
        },
      },
      files: { ".mcp.json": initial },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = expectResolved(yield* applySync());

          expect(countUnitStates(result.units).blocked).toBe(0);
          expect(countUnitStates(result.units).committed).toBeGreaterThan(0);
          const native = workspace.readFile(".mcp.json");
          const decoded: unknown = JSON.parse(native);
          expect(decoded).toMatchObject({
            custom: true,
            mcpServers: {
              demo: { command: "node", args: ["server.js"] },
              foreign: { command: "keep", args: [] },
            },
          });
          expect(native).not.toContain("stale-entry-field");
          expect(native).not.toContain("hand-written");
          yield* applySync();
          expect(workspace.readFile(".mcp.json")).toBe(native);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
