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
  title: "Deprecation validates reason-specific guidance",
  statement:
    "The deprecate command shall reject a field supplied together with its clearing flag before contacting the Registry. After observing current guidance, it shall require a replacement for superseded, prohibit one and require notes for obsolete, allow either field for unmaintained, and require notes for other before attempting a write.",
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
                reason: Option.some("other"),
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
                  reason: Option.some("other"),
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

  for (const testCase of [
    { reason: "superseded", message: Option.some("Notes"), replacement: Option.none<string>() },
    {
      reason: "obsolete",
      message: Option.some("Notes"),
      replacement: Option.some("@acme/skills/replacement"),
    },
    { reason: "obsolete", message: Option.none<string>(), replacement: Option.none<string>() },
  ] as const) {
    it.effect(`rejects invalid ${testCase.reason} guidance before writing`, () =>
      Effect.gen(function* () {
        const world = makeRegistryManagementWorld(() =>
          jsonRegistryResponse({ deprecation: null, revision: observedRevision }),
        );
        const failure = expectPublishFailed(
          yield* world.provide(
            Effect.flip(
              deprecate({
                ref: registryTarget,
                reason: Option.some(testCase.reason),
                message: testCase.message,
                replacement: testCase.replacement,
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
