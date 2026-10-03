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
    ).toMatchObject({
      outcome: "projected",
      mechanism: "native",
      path: ".claude/settings.json",
      hook: {
        implementationId: "claude",
        protocol: "claude-code",
        bindings: [
          {
            id: "audit",
            event: "PreToolUse",
            runtime: "bash",
            entrypoint: "src/hook.sh",
            requiredOutcomes: [],
            requiredOperations: [],
          },
        ],
        conditions: expect.arrayContaining([expect.stringContaining("availability is unverified")]),
        configuration: { status: "not-evaluated", fields: [], issues: [] },
        runtimeAvailability: "unverified",
        nativeInvocation: "not-observed",
      },
    });
  });

  it("reports effective configuration provenance without exposing secret references or values", () => {
    const configuredManifest: HookManifest = {
      ...manifest(),
      configuration: {
        label: { type: "string", default: "publisher", allowEmpty: true },
        token: { type: "string", secret: true, required: true },
        optional: { type: "boolean" },
      },
    };
    const base = {
      agent: agentById("claude-code"),
      manifest: configuredManifest,
      target,
      scope: "project",
      state: "current",
    } as const;
    const outcome = evaluateHookAgentOutcome({
      ...base,
      configuration: { token: { env: "PRIVATE_TOKEN_REFERENCE" } },
    });
    expect(outcome.hook?.configuration).toEqual({
      status: "valid",
      fields: [
        { key: "label", source: "default", value: "publisher", redacted: false },
        { key: "token", source: "consumer", value: null, redacted: true },
        { key: "optional", source: "unset", value: null, redacted: false },
      ],
      issues: [],
    });
    expect(JSON.stringify(outcome)).not.toContain("PRIVATE_TOKEN_REFERENCE");
    const explicitEmpty = evaluateHookAgentOutcome({
      ...base,
      configuration: { label: "", token: "secret-value" },
    });
    expect(explicitEmpty.hook?.configuration).toMatchObject({
      status: "invalid",
      fields: [
        { key: "label", source: "consumer", value: "" },
        { key: "token", source: "consumer", value: null, redacted: true },
        { key: "optional", source: "unset", value: null },
      ],
    });
    expect(JSON.stringify(explicitEmpty)).not.toContain("secret-value");
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
