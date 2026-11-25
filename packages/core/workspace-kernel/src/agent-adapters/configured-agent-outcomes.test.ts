import { describe, expect, it } from "@effect/vitest";
import { extensionTypes } from "@agentxm/extension-model/unstable/extensions/common";
import {
  configuredAgentLifecycleOutcomes,
  EXTENSION_CONFIGURED_AGENT_POLICY,
} from "./configured-agent-outcomes.js";

describe("configuredAgentLifecycleOutcomes", () => {
  it("has an explicit policy for every extension type", () => {
    expect(Object.keys(EXTENSION_CONFIGURED_AGENT_POLICY)).toEqual(extensionTypes);
  });

  it("reports supported, unsupported, unknown, and mixed agents without omissions", () => {
    const outcomes = configuredAgentLifecycleOutcomes({
      type: "mcp-server",
      name: "review",
      agentIds: ["claude-code", "adal", "unknown"],
      scope: "project",
      state: "projected",
      targetState: "enabled",
      installed: false,
    });

    expect(outcomes).toMatchObject([
      { agentId: "claude-code", outcome: "projected", reasonCode: "supported" },
      { agentId: "adal", outcome: "unsupported" },
      { agentId: "unknown", outcome: "unsupported", reasonCode: "unknown-agent" },
    ]);
  });

  it("distinguishes disabled, current, and missing projections", () => {
    const base = {
      type: "mcp-server" as const,
      name: "docs",
      agentIds: ["claude-code", "codex"],
      scope: "project" as const,
      state: "current" as const,
      installed: true,
    };

    expect(
      configuredAgentLifecycleOutcomes({
        ...base,
        targetState: "enabled",
        observedAgentIds: ["claude-code"],
      }),
    ).toMatchObject([
      { agentId: "claude-code", outcome: "current" },
      { agentId: "codex", outcome: "failed", reasonCode: "projection-missing" },
    ]);

    expect(configuredAgentLifecycleOutcomes({ ...base, targetState: "disabled" })).toMatchObject([
      { outcome: "not-applicable", reasonCode: "extension-disabled" },
      { outcome: "not-applicable", reasonCode: "extension-disabled" },
    ]);

    expect(
      configuredAgentLifecycleOutcomes({ ...base, targetState: "enabled", observedAgentIds: [] }),
    ).toMatchObject([
      { outcome: "failed", reasonCode: "projection-missing" },
      { outcome: "failed", reasonCode: "projection-missing" },
    ]);

    expect(configuredAgentLifecycleOutcomes({ ...base, targetState: "absent" })).toMatchObject([
      { outcome: "not-applicable", reasonCode: "extension-absent" },
      { outcome: "not-applicable", reasonCode: "extension-absent" },
    ]);
  });

  it("marks lifecycle containers intentionally not applicable per agent", () => {
    for (const type of ["pack"] as const) {
      expect(
        configuredAgentLifecycleOutcomes({
          type,
          name: "portable",
          agentIds: ["claude-code"],
          scope: "project",
          state: "current",
          targetState: "enabled",
          installed: true,
        }),
      ).toMatchObject([{ agentId: "claude-code", outcome: "not-applicable" }]);
    }
  });

  it("reports an unknown user Skill destination without claiming its artifact is missing", () => {
    expect(
      configuredAgentLifecycleOutcomes({
        type: "skill",
        name: "review",
        agentIds: ["cursor", "claude-code"],
        scope: "user",
        state: "current",
        targetState: "enabled",
        installed: true,
        observedAgentIds: [],
      }),
    ).toMatchObject([
      {
        agentId: "cursor",
        outcome: "unsupported",
        reasonCode: "scope-not-modeled",
        reason: expect.stringContaining("no verified user-scope skill directory"),
      },
      { agentId: "claude-code", outcome: "failed", reasonCode: "projection-missing" },
    ]);
  });
});
