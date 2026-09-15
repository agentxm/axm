import { describe, expect, it } from "vitest";
import { AGENTS, type Agent } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { HookManifest } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
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
      evaluateHookAgentOutcome({
        agent: agentById("claude-code"),
        manifest: manifest(),
        target,
        state: "projected",
      }),
    ).toMatchObject({ outcome: "projected", mechanism: "native", path: ".claude/settings.json" });
  });

  it("reports advisory fallback for observational hooks without a usable writer", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("windsurf"),
        manifest: manifest(),
        target,
        state: "current",
      }),
    ).toMatchObject({ outcome: "current", mechanism: "advisory-fallback", path: "AGENTS.md" });
  });

  it("blocks when fallback is forbidden", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("windsurf"),
        manifest: manifest({ fallback: "none" }),
        target,
        state: "projected",
      }),
    ).toMatchObject({ outcome: "blocked" });
  });

  it("blocks when advisory instructions cannot preserve a decision", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("windsurf"),
        manifest: manifest({ decision: "block" }),
        target,
        state: "projected",
      }),
    ).toMatchObject({ outcome: "blocked" });
  });
});
