import { describe, expect, it } from "@effect/vitest";
import { extensionTypes } from "@agentxm/extension-model/unstable/extensions/common";
import * as Effect from "effect/Effect";
import {
  ConfiguredAgentOutcomesUnavailable,
  resolveConfiguredAgentOutcomes,
  type ConfiguredAgentOutcomesRequest,
} from "./configured-agent-outcomes-provider.js";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";
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
  reasonCode: "verified-native-unit",
  reason: "Manager observed a blocked projection.",
});

describe("resolveConfiguredAgentOutcomes", () => {
  it.effect("skips empty observation requests and preserves nonempty provider failures", () =>
    Effect.gen(function* () {
      let calls = 0;
      const failure = new ConfiguredAgentOutcomesUnavailable({
        category: "network",
        detail: "Manager read failed",
      });
      const provider = {
        byExtensionType: {
          "mcp-server": () =>
            Effect.sync(() => {
              calls += 1;
            }).pipe(Effect.andThen(Effect.fail(failure))),
        },
      };
      const empty = yield* resolveConfiguredAgentOutcomes(provider, { ...request, rows: [] });
      expect(empty.size).toBe(0);
      expect(calls).toBe(0);
      const observedFailure = yield* Effect.flip(resolveConfiguredAgentOutcomes(provider, request));
      expect(observedFailure).toBe(failure);
      expect(calls).toBe(1);
    }),
  );

  it.effect("requires native observation before claiming a Knowledge bundle is current", () =>
    Effect.gen(function* () {
      const outcomes = yield* resolveConfiguredAgentOutcomes(
        { byExtensionType: {} },
        {
          type: "knowledge",
          state: "current",
          scope: "project",
          agentIds: ["claude-code"],
          rows: [{ name: "handbook", targetState: "enabled", installed: true }],
        },
      );
      expect(outcomes.get("handbook")).toMatchObject([
        { outcome: "blocked", reasonCode: "native-observation-unavailable" },
      ]);
    }),
  );

  it.effect("uses one provider read for enabled rows and generic outcomes for disabled rows", () =>
    Effect.gen(function* () {
      let calls = 0;
      const outcomes = yield* resolveConfiguredAgentOutcomes(
        {
          byExtensionType: {
            "mcp-server": () =>
              Effect.sync(() => {
                calls += 1;
                return new Map(
                  ["active", "disabled"].map((name) => [
                    name,
                    { agentOutcomes: [providerOutcome(name)], nativeLocations: [] },
                  ]),
                );
              }),
          },
        },
        request,
      );
      expect(calls).toBe(1);
      expect(outcomes.get("active")).toMatchObject([{ reasonCode: "verified-native-unit" }]);
      expect(outcomes.get("second")).toMatchObject([
        { outcome: "blocked", reasonCode: "native-observation-unavailable" },
      ]);
      expect(outcomes.get("disabled")).toMatchObject([
        { outcome: "not-applicable", reasonCode: "extension-disabled" },
      ]);
    }),
  );

  it.effect("reports unknown observation when the provider has no result for an enabled row", () =>
    Effect.gen(function* () {
      const outcomes = yield* resolveConfiguredAgentOutcomes(
        {
          byExtensionType: { "mcp-server": () => Effect.succeed(new Map()) },
        },
        request,
      );
      expect(outcomes.get("active")).toMatchObject([
        { outcome: "blocked", reasonCode: "native-observation-unavailable" },
      ]);
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
