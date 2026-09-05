import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleUnyank, PlanResolutionDocumentSchema } from "axm.sh/specification-harness";
import {
  makeRegistryManagementContext,
  registryTarget,
  registryTargetPath,
  registryVersion,
  versionLifecycleResponse,
} from "../../support/registry-management-harness.js";

export const specification = defineSpecification({
  requirement: "cli/unyank/requires-an-exact-version",
  title: "Unyank restores only the explicitly identified version",
  statement:
    "The unyank command shall require an exact semantic version, request restoration only for that version, and report restoration only after the Registry acknowledges the request.",
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

describe("Exact restoration", () => {
  it.effect("sends a single version-specific deletion and reports that version", () =>
    Effect.gen(function* () {
      const context = makeRegistryManagementContext(() => versionLifecycleResponse(false));
      yield* context.provide(handleUnyank(registryVersion));
      expect(context.requests).toHaveLength(1);
      expect(context.requests[0]?.method).toBe("DELETE");
      expect(context.requests[0]?.url.pathname).toBe(`${registryTargetPath}/1.2.3/yank`);
      expect(context.rendererState.results).toHaveLength(1);
      const output = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        context.rendererState.results[0]?.data,
      );
      expect(output.result.units).toEqual([
        expect.objectContaining({ id: registryVersion, state: "committed" }),
      ]);
    }),
  );

  for (const ref of [registryTarget, `${registryTarget}@^1.2.3`, `${registryTarget}@*`]) {
    it.effect(`rejects non-exact restoration ${ref}`, () =>
      Effect.gen(function* () {
        const context = makeRegistryManagementContext(() => {
          throw new Error("Invalid selection must not contact the Registry");
        });
        const error = yield* context.provide(Effect.flip(handleUnyank(ref)));
        expect(error).toMatchObject({ code: "validation" });
        expect(context.requests).toEqual([]);
        expect(context.rendererState.results).toEqual([]);
      }),
    );
  }
});
