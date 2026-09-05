import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleYank, PlanResolutionDocumentSchema } from "axm.sh/specification-harness";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  registryTarget,
  registryTargetPath,
  registryVersion,
  versionLifecycleResponse,
} from "../../support/registry-management-harness.js";

export const specification = defineSpecification({
  requirement: "cli/yank/submits-the-requested-version-selection",
  title: "Yank submits the explicit version selection and publisher guidance",
  statement:
    "The yank command shall require an exact version unless all available versions are explicitly selected, submit only that selection with the supplied category and notice, and report the acknowledged selection without claiming that future versions were yanked.",
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

describe("Yank selection", () => {
  it.effect("posts one exact version and its guidance before reporting one committed unit", () =>
    Effect.gen(function* () {
      const context = makeRegistryManagementContext(() => versionLifecycleResponse(true));
      yield* context.provide(
        handleYank({
          ref: registryVersion,
          allVersions: false,
          category: Option.some("security"),
          notice: Option.some("Unsafe release."),
        }),
      );
      expect(context.requests).toHaveLength(1);
      expect(context.requests[0]).toMatchObject({
        method: "POST",
        body: { category: "security", notice: "Unsafe release." },
      });
      expect(context.requests[0]?.url.pathname).toBe(`${registryTargetPath}/1.2.3/yank`);
      expect(context.rendererState.results).toHaveLength(1);
      const output = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        context.rendererState.results[0]?.data,
      );
      expect(output.result.units).toEqual([
        expect.objectContaining({ id: registryVersion, state: "committed" }),
      ]);
      expect(output.result.units[0]?.message).toContain("Exact installs remain available");
    }),
  );

  it.effect("uses the all-available selection and reports the Registry's acknowledged count", () =>
    Effect.gen(function* () {
      const context = makeRegistryManagementContext(() =>
        jsonRegistryResponse({
          selection: "all-available",
          affectedVersions: ["1.0.0", "1.2.3"],
          futureVersionsAffected: false,
        }),
      );
      yield* context.provide(
        handleYank({
          ref: registryTarget,
          allVersions: true,
          category: Option.none(),
          notice: Option.none(),
        }),
      );
      expect(context.requests).toHaveLength(1);
      expect(context.requests[0]?.url.pathname).toBe(`${registryTargetPath}/versions/yank`);
      expect(context.requests[0]).toMatchObject({
        method: "POST",
        body: { selection: "all-available" },
      });
      const output = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        context.rendererState.results[0]?.data,
      );
      expect(output.result.units[0]?.message).toContain("2 available versions");
      expect(output.result.units[0]?.message).toContain("Future versions are unaffected");
    }),
  );

  for (const ref of [registryTarget, `${registryTarget}@^1.2.3`, `${registryTarget}@*`]) {
    it.effect(`rejects ${ref} without an exact selection before contacting the Registry`, () =>
      Effect.gen(function* () {
        const context = makeRegistryManagementContext(() => {
          throw new Error("Invalid selection must not contact the Registry");
        });
        const error = yield* context.provide(
          Effect.flip(
            handleYank({ ref, allVersions: false, category: Option.none(), notice: Option.none() }),
          ),
        );
        expect(error).toMatchObject({ code: "validation" });
        expect(context.requests).toEqual([]);
        expect(context.rendererState.results).toEqual([]);
      }),
    );
  }
});
