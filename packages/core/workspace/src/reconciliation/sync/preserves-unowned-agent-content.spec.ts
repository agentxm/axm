import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates } from "../../transitions/planning/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  writeLocalSkillPackage,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-unowned-agent-content",
  title: "Sync never removes agent-native content without AXM ownership proof",
  statement:
    "When sync retires agent-native content that desired state no longer reaches, it shall remove only content AXM can prove it owns and shall leave hand-authored neighbors in the same agent directory untouched; and when a desired projection would overwrite agent-native content AXM cannot prove it owns, sync shall block that projection and leave the content untouched.",
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

  it.effect("blocks an inline MCP server that collides with an unowned native entry", () => {
    const unowned = JSON.stringify(
      { mcpServers: { demo: { command: "hand-written", args: [] } } },
      null,
      2,
    );
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        mcpServers: { demo: { command: "node", args: ["server.js"] } },
      },
      files: { ".mcp.json": unowned },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = expectResolved(yield* applySync());

          expect(countUnitStates(result.units).blocked).toBeGreaterThan(0);
          expect(JSON.stringify(result)).toContain("collides with unowned native config");
          expect(workspace.readFile(".mcp.json")).toBe(unowned);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
