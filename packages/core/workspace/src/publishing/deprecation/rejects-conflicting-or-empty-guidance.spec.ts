import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { deprecate } from "../lifecycle/deprecation.js";
import {
  expectPublishFailed,
  jsonRegistryResponse,
  makeRegistryManagementWorld,
  observedRevision,
  registryTarget,
} from "../test-helpers.js";

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
    "apps/cli/src/root/lifecycle/command.ts",
    "apps/cli/src/root/lifecycle/command.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Valid deprecation guidance", () => {
  for (const field of ["message", "replacement"] as const) {
    it.effect(`rejects setting and clearing ${field} before reading or writing`, () =>
      Effect.gen(function* () {
        const world = makeRegistryManagementWorld(() => {
          throw new Error("Conflicting flags must not contact the Registry");
        });

        const failure = expectPublishFailed(
          yield* world.provide(
            Effect.flip(
              deprecate({
                ref: registryTarget,
                message: field === "message" ? Option.some("Guidance.") : Option.none(),
                replacement:
                  field === "replacement" ? Option.some("@acme/skills/replacement") : Option.none(),
                clearMessage: field === "message",
                clearReplacement: field === "replacement",
              }),
            ),
          ),
        );

        expect(failure.category).toBe("validation");
        expect(world.requests).toEqual([]);
      }),
    );
  }

  for (const message of [Option.none<string>(), Option.some("  ")]) {
    it.effect(
      `rejects ${Option.isNone(message) ? "missing" : "blank"} effective guidance after observation without writing`,
      () =>
        Effect.gen(function* () {
          const world = makeRegistryManagementWorld(() =>
            jsonRegistryResponse({ deprecation: null, revision: observedRevision }),
          );

          const failure = expectPublishFailed(
            yield* world.provide(
              Effect.flip(
                deprecate({
                  ref: registryTarget,
                  message,
                  replacement: Option.none(),
                  clearMessage: false,
                  clearReplacement: false,
                }),
              ),
            ),
          );

          expect(failure.category).toBe("validation");
          expect(world.requests.map(({ method }) => method)).toEqual(["GET"]);
        }),
    );
  }
});
