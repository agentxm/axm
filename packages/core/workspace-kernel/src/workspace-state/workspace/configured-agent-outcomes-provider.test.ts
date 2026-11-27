import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  ConfiguredAgentOutcomesUnavailable,
  resolveConfiguredExtensionObservations,
  type ConfiguredAgentOutcomesRequest,
} from "./configured-agent-outcomes-provider.js";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";

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

describe("resolveConfiguredExtensionObservations", () => {
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
      const empty = yield* resolveConfiguredExtensionObservations(provider, {
        ...request,
        rows: [],
      });
      expect(empty.size).toBe(0);
      expect(calls).toBe(0);
      const observedFailure = yield* Effect.flip(
        resolveConfiguredExtensionObservations(provider, request),
      );
      expect(observedFailure).toBe(failure);
      expect(calls).toBe(1);
    }),
  );

  it.effect("requires native observation before claiming a Knowledge bundle is current", () =>
    Effect.gen(function* () {
      const observations = yield* resolveConfiguredExtensionObservations(
        { byExtensionType: {} },
        {
          type: "knowledge",
          state: "current",
          scope: "project",
          agentIds: ["claude-code"],
          rows: [{ name: "handbook", targetState: "enabled", installed: true }],
        },
      );
      expect(observations.get("handbook")?.agentOutcomes).toMatchObject([
        { outcome: "blocked", reasonCode: "native-observation-unavailable" },
      ]);
    }),
  );

  it.effect("uses one provider read for enabled rows and generic outcomes for disabled rows", () =>
    Effect.gen(function* () {
      let calls = 0;
      const observations = yield* resolveConfiguredExtensionObservations(
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
      expect(observations.get("active")?.agentOutcomes).toMatchObject([
        { reasonCode: "verified-native-unit" },
      ]);
      expect(observations.get("second")?.agentOutcomes).toMatchObject([
        { outcome: "blocked", reasonCode: "native-observation-unavailable" },
      ]);
      expect(observations.get("disabled")?.agentOutcomes).toMatchObject([
        { outcome: "not-applicable", reasonCode: "extension-disabled" },
      ]);
    }),
  );

  it.effect("reports unknown observation when the provider has no result for an enabled row", () =>
    Effect.gen(function* () {
      const observations = yield* resolveConfiguredExtensionObservations(
        {
          byExtensionType: { "mcp-server": () => Effect.succeed(new Map()) },
        },
        request,
      );
      expect(observations.get("active")?.agentOutcomes).toMatchObject([
        { outcome: "blocked", reasonCode: "native-observation-unavailable" },
      ]);
    }),
  );

  it.effect("preserves typed provider failures for the caller to handle", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        resolveConfiguredExtensionObservations(
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
