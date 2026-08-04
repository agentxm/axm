import { describe, expect, it } from "@effect/vitest";
import {
  resolveInstructionMechanism,
  resolveInstructionTarget,
  type InstructionTargetResolution,
} from "./instructions.js";
import { AGENTS, getAgentIds } from "./registry.js";
import type { AgentId } from "./types.js";

const SOURCE = "AGENTS.md";

/**
 * Frozen expectations that turn `resolveInstructionTarget` into a drift guard
 * over the whole capability catalog. Adding (or removing) an `instructions:`
 * block in a catalog agent's YAML changes its action, which fails this test
 * until the lists below — and the gap audit they mirror — are updated.
 *
 * Every agent NOT listed here is expected to resolve to `native` (reads the
 * shared source file directly), so the ~40 agents-md agents need no upkeep.
 */
const EXPECTED_WRITE: ReadonlyArray<AgentId> = ["claude-code", "codebuddy", "gemini-cli", "junie"];
const EXPECTED_ADAPTER: ReadonlyArray<AgentId> = [
  "cline",
  "continue",
  "kiro-cli",
  "roo",
  "trae",
  "trae-cn",
  "zencoder",
];
// 16 catalog agents have no `instructions:` block, plus the synthetic
// `universal` agent. Each is a gap-audit candidate: encoding `kind: agents-md`
// (or own-file/rules-dir) in its catalog YAML flips it out of this list and
// forces a deliberate update here.
const EXPECTED_SKIP: ReadonlyArray<AgentId> = [
  "aider-desk",
  "codearts-agent",
  "codemaker",
  "codestudio",
  "cortex",
  "dexto",
  "firebender",
  "goose",
  "kimi-cli",
  "mcpjam",
  "neovate",
  "openclaw",
  "replit",
  "rovodev",
  "tabnine-cli",
  "universal",
  "warp",
];

const sorted = (ids: ReadonlyArray<string>): ReadonlyArray<string> => [...ids].sort();

const classifyAll = (symlinkSupported: boolean) => {
  const byAction: Record<InstructionTargetResolution["action"], Array<AgentId>> = {
    native: [],
    write: [],
    adapter: [],
    skip: [],
  };
  for (const id of getAgentIds()) {
    const resolution = resolveInstructionTarget({
      instructions: AGENTS[id].instructions,
      sourceFileName: SOURCE,
      symlinkSupported,
    });
    byAction[resolution.action].push(id);
  }
  return byAction;
};

describe("resolveInstructionTarget", () => {
  it("classifies every registry agent (catalog drift guard)", () => {
    const byAction = classifyAll(true);

    expect(sorted(byAction.write)).toEqual(sorted(EXPECTED_WRITE));
    expect(sorted(byAction.adapter)).toEqual(sorted(EXPECTED_ADAPTER));
    expect(sorted(byAction.skip)).toEqual(sorted(EXPECTED_SKIP));

    // No agent falls outside the four actions, and the long tail is native.
    const classified =
      byAction.native.length +
      byAction.write.length +
      byAction.adapter.length +
      byAction.skip.length;
    expect(classified).toBe(getAgentIds().length);
    expect(byAction.native.length).toBeGreaterThan(0);
  });

  it("targets the agent-native filename for own-file agents", () => {
    expect(
      resolveInstructionTarget({
        instructions: AGENTS["claude-code"].instructions,
        sourceFileName: SOURCE,
        symlinkSupported: true,
      }),
    ).toEqual({ action: "write", mechanism: "symlink", relativeTarget: "CLAUDE.md" });

    expect(
      resolveInstructionTarget({
        instructions: AGENTS["gemini-cli"].instructions,
        sourceFileName: SOURCE,
        symlinkSupported: true,
      }),
    ).toEqual({ action: "write", mechanism: "symlink", relativeTarget: "GEMINI.md" });
  });

  it("falls back from symlink to copy when symlinks are unavailable", () => {
    expect(
      resolveInstructionTarget({
        instructions: AGENTS["claude-code"].instructions,
        sourceFileName: SOURCE,
        symlinkSupported: false,
      }),
    ).toEqual({ action: "write", mechanism: "copy", relativeTarget: "CLAUDE.md" });
  });

  it("points agents-md agents at the source file itself, honoring a custom name", () => {
    expect(
      resolveInstructionTarget({
        instructions: AGENTS.codex.instructions,
        sourceFileName: "CONTEXT.md",
        symlinkSupported: true,
      }),
    ).toEqual({ action: "native", mechanism: "native", relativeTarget: "CONTEXT.md" });
  });

  it("skips agents with no encoded instruction convention", () => {
    expect(
      resolveInstructionTarget({
        instructions: undefined,
        sourceFileName: SOURCE,
        symlinkSupported: true,
      }),
    ).toEqual({ action: "skip", reason: "no-convention" });

    expect(
      resolveInstructionTarget({
        instructions: AGENTS["aider-desk"].instructions,
        sourceFileName: SOURCE,
        symlinkSupported: true,
      }).action,
    ).toBe("skip");
  });

  it("agrees with resolveInstructionMechanism for every syncable agent", () => {
    for (const id of getAgentIds()) {
      const descriptor = AGENTS[id].instructions;
      if (descriptor === undefined) continue;
      const resolution = resolveInstructionTarget({
        instructions: descriptor,
        sourceFileName: SOURCE,
        symlinkSupported: true,
      });
      expect(resolution.action).not.toBe("skip");
      if (resolution.action !== "skip") {
        expect(resolution.mechanism).toBe(resolveInstructionMechanism(descriptor, true));
        // action ↔ mechanism invariant the plan preview relies on.
        if (resolution.action === "native") expect(resolution.mechanism).toBe("native");
        if (resolution.action === "write") {
          expect(["symlink", "copy"]).toContain(resolution.mechanism);
        }
        if (resolution.action === "adapter") expect(resolution.mechanism).toBe("adapter");
      }
    }
  });
});
