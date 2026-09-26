import { describe, expect, it } from "@effect/vitest";
import { extensionTypes } from "@agentxm/extension-model/unstable/extensions/common";
import * as Effect from "effect/Effect";
import {
  ConfiguredAgentOutcomesUnavailable,
  resolveConfiguredAgentOutcomes,
  type ConfiguredAgentOutcomesRequest,
} from "./configured-agent-outcomes-provider.js";
import type { ConfiguredAgentOutcome } from "./configured-agent-outcome.js";
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

  it("marks workspace and container types intentionally not applicable per agent", () => {
    for (const type of ["knowledge", "pack"] as const) {
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
});

const request = {
  type: "mcp-server",
  state: "current",
  scope: "project",
  agentIds: ["claude-code"],
  rows: [
    { name: "active", targetState: "enabled", installed: true, observedAgentIds: ["claude-code"] },
    { name: "second", targetState: "enabled", installed: true, observedAgentIds: ["claude-code"] },
    { name: "disabled", targetState: "disabled", installed: true, observedAgentIds: [] },
  ],
} as const satisfies ConfiguredAgentOutcomesRequest;

const providerOutcome = (name: string): ConfiguredAgentOutcome => ({
  extensionType: "mcp-server",
  name,
  agentId: "claude-code",
  outcome: "blocked",
  reasonCode: "provider-observed",
  reason: "Manager observed a blocked projection.",
});

describe("resolveConfiguredAgentOutcomes", () => {
  it.effect("uses one provider read for enabled rows and generic outcomes for disabled rows", () =>
    Effect.gen(function* () {
      let calls = 0;
      const outcomes = yield* resolveConfiguredAgentOutcomes(
        {
          byExtensionType: {
            "mcp-server": () =>
              Effect.sync(() => {
                calls += 1;
                return [providerOutcome("active"), providerOutcome("disabled")];
              }),
          },
        },
        request,
      );
      expect(calls).toBe(1);
      expect(outcomes.get("active")).toMatchObject([{ reasonCode: "provider-observed" }]);
      expect(outcomes.get("second")).toMatchObject([{ outcome: "current" }]);
      expect(outcomes.get("disabled")).toMatchObject([
        { outcome: "not-applicable", reasonCode: "extension-disabled" },
      ]);
    }),
  );

  it.effect("falls back when the provider has no result for an enabled row", () =>
    Effect.gen(function* () {
      const outcomes = yield* resolveConfiguredAgentOutcomes(
        {
          byExtensionType: { "mcp-server": () => Effect.succeed([]) },
        },
        request,
      );
      expect(outcomes.get("active")).toMatchObject([{ outcome: "current" }]);
    }),
  );

  it.effect("preserves typed provider failures for the caller to handle", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        resolveConfiguredAgentOutcomes(
          {
            byExtensionType: {
              "mcp-server": () =>
                Effect.fail(
                  new ConfiguredAgentOutcomesUnavailable({
                    category: "network",
                    detail: "Manager read failed",
                  }),
                ),
            },
          },
          request,
        ),
      );
      expect(failure.category).toBe("network");
    }),
  );
});
