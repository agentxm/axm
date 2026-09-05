import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleDeprecate } from "axm.sh/specification-harness";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  observedRevision,
  registryTarget,
} from "../../support/registry-management-harness.js";

export const specification = defineSpecification({
  requirement: "cli/deprecate/rejects-conflicting-or-empty-guidance",
  title: "Deprecation rejects contradictory or empty guidance",
  statement:
    "The deprecate command shall reject a field supplied together with its clearing flag before contacting the Registry and reject an edit that leaves neither a message nor a replacement before attempting a write.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/lifecycle/command.ts",
    "packages/cli/src/root/lifecycle/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Valid deprecation guidance", () => {
  for (const field of ["message", "replacement"] as const) {
    it.effect(`rejects setting and clearing ${field} before reading or writing`, () =>
      Effect.gen(function* () {
        const context = makeRegistryManagementContext(() => {
          throw new Error("Conflicting flags must not contact the Registry");
        });
        const error = yield* context.provide(
          Effect.flip(
            handleDeprecate({
              ref: registryTarget,
              message: field === "message" ? Option.some("Guidance.") : Option.none(),
              replacement:
                field === "replacement" ? Option.some("@acme/skills/replacement") : Option.none(),
              clearMessage: field === "message",
              clearReplacement: field === "replacement",
            }),
          ),
        );
        expect(error).toMatchObject({ code: "validation" });
        expect(context.requests).toEqual([]);
        expect(context.rendererState.results).toEqual([]);
      }),
    );
  }
  for (const message of [Option.none<string>(), Option.some("  ")]) {
    it.effect("rejects empty effective guidance after observation without writing", () =>
      Effect.gen(function* () {
        const context = makeRegistryManagementContext(() =>
          jsonRegistryResponse({ deprecation: null, revision: observedRevision }),
        );
        const error = yield* context.provide(
          Effect.flip(
            handleDeprecate({
              ref: registryTarget,
              message,
              replacement: Option.none(),
              clearMessage: false,
              clearReplacement: false,
            }),
          ),
        );
        expect(error).toMatchObject({ code: "validation" });
        expect(context.requests.map(({ method }) => method)).toEqual(["GET"]);
        expect(context.rendererState.results).toEqual([]);
      }),
    );
  }
});
