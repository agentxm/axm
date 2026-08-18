import { describe, expect, it } from "vitest";
import { AGENTS, type Agent } from "../agent-capabilities/index.js";
import { decodeExtensionNameSync, decodeHandleSync } from "../extensions/index.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import type { HookManifest } from "./manifest-schema.js";
import { evaluateHookAgentOutcome } from "./outcomes.js";

const agentById = (id: string): Agent => {
  const agent = AGENTS.find((candidate) => candidate.id === id);
  if (agent === undefined) throw new Error(`Missing test agent ${id}`);
  return agent;
};

const manifest = (args?: {
  readonly fallback?: "auto" | "none";
  readonly decision?: "observe" | "block" | "modify";
}): HookManifest => ({
  owner: decodeHandleSync("@acme"),
  type: "hook",
  name: decodeExtensionNameSync("audit"),
  version: decodeVersionSync("1.0.0"),
  runtime: "bash",
  entrypoint: "src/hook.sh",
  bindings: [
    {
      on: "tool.pre",
      ...(args?.decision === undefined ? {} : { requires: { decision: { kind: args.decision } } }),
    },
  ],
  ...(args?.fallback === undefined ? {} : { fallback: args.fallback }),
});

const target = { nativePath: ".claude/settings.json", fallbackPath: "AGENTS.md" };

describe("evaluateHookAgentOutcome", () => {
  it("reports native when every binding is supported", () => {
    expect(
      evaluateHookAgentOutcome({ agent: agentById("claude-code"), manifest: manifest(), target }),
    ).toMatchObject({ outcome: "native", path: ".claude/settings.json" });
  });

  it("reports advisory fallback for observational hooks without a usable writer", () => {
    expect(
      evaluateHookAgentOutcome({ agent: agentById("windsurf"), manifest: manifest(), target }),
    ).toMatchObject({ outcome: "advisory-fallback", path: "AGENTS.md" });
  });

  it("blocks when fallback is forbidden", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("windsurf"),
        manifest: manifest({ fallback: "none" }),
        target,
      }),
    ).toMatchObject({ outcome: "blocked" });
  });

  it("blocks when advisory instructions cannot preserve a decision", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("windsurf"),
        manifest: manifest({ decision: "block" }),
        target,
      }),
    ).toMatchObject({ outcome: "blocked" });
  });
});
