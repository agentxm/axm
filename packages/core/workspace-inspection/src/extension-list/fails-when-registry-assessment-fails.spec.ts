import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./list-extensions.js";
import { makeInstalledSkillFixture } from "../testing.js";

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
    "apps/cli/src/root/list/command.test.ts",
    "packages/core/workspace-inspection/src/extension-list/list-extensions.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Failed Registry assessment", () => {
  for (const filter of ["outdated", "deprecated"] as const)
    it.effect(filter, () => {
      const fixture = makeInstalledSkillFixture({
        respond: () => ({
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
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const running = yield* Effect.result(ListExtensions.query({ filter })).pipe(
              Effect.forkChild,
            );
            yield* fixture.firstRequest;
            // Exhaust registry-client's retry policy on Effect time.
            yield* TestClock.adjust("31 seconds");
            expect(Result.isFailure(yield* Fiber.join(running))).toBe(true);
            expect(fixture.requests.length).toBeGreaterThan(0);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
