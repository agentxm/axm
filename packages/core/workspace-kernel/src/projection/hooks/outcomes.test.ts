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

const manifest = (): HookManifest => ({
  owner: decodeHandleSync("@acme"),
  type: "hook",
  name: decodeExtensionNameSync("audit"),
  version: decodeVersionSync("1.0.0"),
  implementations: [
    {
      id: "claude",
      protocol: "claude-code",
      bindings: [
        {
          id: "audit",
          event: "PreToolUse",
          handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
        },
      ],
    },
  ],
});
const target = { nativePath: ".claude/settings.json" };

describe("evaluateHookAgentOutcome", () => {
  it("reports native when every binding is supported", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("claude-code"),
        manifest: manifest(),
        target,
        scope: "project",
        state: "projected",
      }),
    ).toMatchObject({ outcome: "projected", mechanism: "native", path: ".claude/settings.json" });
  });

  it("blocks unsupported hosts without inventing advisory execution", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("windsurf"),
        manifest: manifest(),
        target: {},
        scope: "project",
        state: "current",
      }),
    ).toMatchObject({ outcome: "blocked" });
  });
  it("blocks missing native implementations even when a host writer exists", () => {
    expect(
      evaluateHookAgentOutcome({
        agent: agentById("codex"),
        manifest: manifest(),
        target,
        scope: "project",
        state: "projected",
      }),
    ).toMatchObject({ outcome: "blocked", reasonCode: "hook-native-implementation-unavailable" });
  });
});
