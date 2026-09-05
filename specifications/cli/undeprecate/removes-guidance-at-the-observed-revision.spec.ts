import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleUndeprecate, LifecycleTransitionOutputSchema } from "axm.sh/specification-harness";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  observedRevision,
  registryProblem,
  registryTarget,
  registryTargetPath,
} from "../../support/registry-management-harness.js";

export const specification = defineSpecification({
  requirement: "cli/undeprecate/removes-guidance-at-the-observed-revision",
  title: "Deprecation removal uses the observed revision",
  statement:
    "The undeprecate command shall read the selected extension's deprecation revision, use that exact revision as the removal precondition, and report the Registry's acknowledged transition without silently replacing a rejected precondition.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "packages/cli/src/root/lifecycle/command.ts",
    "packages/cli/src/root/lifecycle/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Conditional deprecation removal", () => {
  const before = { deprecatedAt: "2026-07-29T00:00:00.000Z", message: "Existing guidance." };
  const transition = {
    target: registryTarget,
    before,
    after: null,
    disposition: "restored",
    revision: "opaque-new-revision",
  };
  for (const rejected of [false, true]) {
    it.effect(
      rejected
        ? "reports a rejected precondition without rereading or replaying"
        : "removes the observed state and reports one acknowledged transition",
      () =>
        Effect.gen(function* () {
          const context = makeRegistryManagementContext((request) =>
            request.method === "GET"
              ? jsonRegistryResponse({ deprecation: before, revision: observedRevision })
              : rejected
                ? registryProblem("conflict", 412)
                : jsonRegistryResponse(transition),
          );
          const result = yield* context.provide(
            handleUndeprecate(registryTarget).pipe(Effect.exit),
          );
          expect(result._tag).toBe(rejected ? "Failure" : "Success");
          expect(context.requests.map(({ method }) => method)).toEqual(["GET", "DELETE"]);
          expect(
            context.requests.every(
              ({ url }) => url.pathname === `${registryTargetPath}/deprecation`,
            ),
          ).toBe(true);
          expect(context.requests[1]?.ifMatch).toBe(observedRevision);
          if (rejected) expect(context.rendererState.results).toEqual([]);
          else {
            expect(context.rendererState.results).toHaveLength(1);
            const output = yield* Schema.encodeUnknownEffect(LifecycleTransitionOutputSchema)(
              context.rendererState.results[0]?.data,
            );
            expect(output).toEqual(transition);
          }
        }),
    );
  }
});
