import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Result from "effect/Result";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { afterEach } from "vitest";
import { handleList } from "axm.sh/specification-harness";
import { makeInstalledReadFixture } from "../../support/read-inventory-fixture.js";
import { readRegistry } from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/list/fails-when-registry-assessment-fails",
  title: "List exposes failed Registry assessment",
  statement:
    "When a requested Registry assessment fails, AXM shall fail the list command without presenting a successful empty or current assessment.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/list/command.internal.test.ts",
    "packages/workspace-inspection/src/extension-list.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Failed Registry assessment", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const filter of ["outdated", "deprecated"] as const)
    it.effect(filter, () =>
      Effect.gen(function* () {
        const { workspace, registry } = yield* makeInstalledReadFixture(cleanups);
        const settings = workspace.readSettings();
        if (typeof settings !== "object" || settings === null)
          throw new Error("Expected workspace settings");
        workspace.writeSettings({
          ...settings,
          sources: [{ ...registry.source, location: readRegistry }],
        });
        workspace.rendererState.results.length = 0;
        yield* workspace.withRegistry(
          Effect.gen(function* () {
            const running = yield* Effect.result(
              handleList({
                type: Option.none(),
                outdated: filter === "outdated",
                deprecated: filter === "deprecated",
              }),
            ).pipe(Effect.forkChild);
            yield* workspace.waitForRegistryRequest;
            yield* TestClock.adjust("31 seconds");
            expect(Result.isFailure(yield* Fiber.join(running))).toBe(true);
            expect(workspace.requests.length).toBeGreaterThan(0);
            expect(workspace.rendererState.results).toEqual([]);
          }),
          () => ({
            status: 503,
            body: {
              kind: "ServiceUnavailableError",
              type: "about:blank",
              title: "Service unavailable",
              status: 503,
              code: "service_unavailable",
              detail: "Fixture Registry unavailable",
            },
          }),
        );
      }),
    );
});
