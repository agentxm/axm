import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { DeprecationTransitionSchema } from "@agentxm/registry-protocol/unstable/registry";

import { deprecate } from "../lifecycle/deprecation.js";
import {
  jsonRegistryResponse,
  makeRegistryManagementWorld,
  observedRevision,
  registryTarget,
  registryTargetPath,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/deprecate/updates-guidance-at-the-observed-revision",
  title: "Deprecation edits preserve omitted guidance at the observed revision",
  statement:
    "The deprecate command shall compose the requested message and replacement edits with the observed guidance, preserve omitted and concealed replacement information, condition the write on the observed revision, and report the Registry's acknowledged transition, carrying the publisher guidance the Registry acknowledged.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "apps/cli/src/root/lifecycle/command.ts",
    "apps/cli/src/root/lifecycle/command.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Whether a person sees the acknowledged guidance presented as result information rather than as a warning is the application's rendering of this transition, not the transition itself, so it is not observed here.",
      retirementCondition:
        "The CLI owns evidence, beside its lifecycle renderer, that acknowledged publisher guidance is presented as information and raises no warning.",
    },
  ],
});

const deprecatedAt = "2026-07-29T00:00:00.000Z";
const replacement = "@acme/skills/replacement";
const acknowledgement = {
  target: registryTarget,
  before: null,
  after: {
    deprecatedAt,
    message: "Acknowledged guidance.",
    replacement: { status: "available", fqn: replacement },
  },
  disposition: "created",
  revision: "opaque-new-revision",
};

const makeWorld = (current: unknown) =>
  makeRegistryManagementWorld((request) => {
    expect(request.url.pathname).toBe(`${registryTargetPath}/deprecation`);
    return jsonRegistryResponse(
      request.method === "GET"
        ? { deprecation: current, revision: observedRevision }
        : acknowledgement,
    );
  });

describe("Deprecation patch composition", () => {
  const cases = [
    {
      name: "new message",
      current: null,
      message: Option.some("  New guidance.  "),
      replacement: Option.none<string>(),
      clearMessage: false,
      clearReplacement: false,
      expected: { message: "New guidance.", replacement: { kind: "clear" } },
    },
    {
      name: "replacement only",
      current: null,
      message: Option.none<string>(),
      replacement: Option.some(replacement),
      clearMessage: false,
      clearReplacement: false,
      expected: { message: null, replacement: { kind: "set", fqn: replacement } },
    },
    {
      name: "omitted message",
      current: { deprecatedAt, message: "Existing guidance." },
      message: Option.none<string>(),
      replacement: Option.some(replacement),
      clearMessage: false,
      clearReplacement: false,
      expected: { message: "Existing guidance.", replacement: { kind: "set", fqn: replacement } },
    },
    {
      name: "visible omitted replacement",
      current: { deprecatedAt, replacement: { status: "available", fqn: replacement } },
      message: Option.some("New guidance."),
      replacement: Option.none<string>(),
      clearMessage: false,
      clearReplacement: false,
      expected: { message: "New guidance.", replacement: { kind: "set", fqn: replacement } },
    },
    {
      name: "concealed omitted replacement",
      current: { deprecatedAt, message: "Old guidance.", replacement: { status: "unavailable" } },
      message: Option.some("New guidance."),
      replacement: Option.none<string>(),
      clearMessage: false,
      clearReplacement: false,
      expected: { message: "New guidance.", replacement: { kind: "preserve" } },
    },
    {
      name: "explicit message clearing",
      current: {
        deprecatedAt,
        message: "Old guidance.",
        replacement: { status: "available", fqn: replacement },
      },
      message: Option.none<string>(),
      replacement: Option.none<string>(),
      clearMessage: true,
      clearReplacement: false,
      expected: { message: null, replacement: { kind: "set", fqn: replacement } },
    },
    {
      name: "explicit replacement clearing",
      current: { deprecatedAt, message: "Old guidance.", replacement: { status: "unavailable" } },
      message: Option.none<string>(),
      replacement: Option.none<string>(),
      clearMessage: false,
      clearReplacement: true,
      expected: { message: "Old guidance.", replacement: { kind: "clear" } },
    },
  ];

  for (const scenario of cases) {
    it.effect(
      `applies ${scenario.name} conditionally and reports the acknowledged transition`,
      () =>
        Effect.gen(function* () {
          const world = makeWorld(scenario.current);

          const written = yield* world.provide(
            deprecate({
              ref: registryTarget,
              message: scenario.message,
              replacement: scenario.replacement,
              clearMessage: scenario.clearMessage,
              clearReplacement: scenario.clearReplacement,
            }),
          );

          expect(world.requests.map(({ method }) => method)).toEqual(["GET", "PUT"]);
          expect(world.requests[1]).toMatchObject({
            ifMatch: observedRevision,
            body: scenario.expected,
          });
          expect(
            yield* Schema.encodeUnknownEffect(DeprecationTransitionSchema)(written.transition),
          ).toEqual(acknowledgement);
        }),
    );
  }

  it.effect("carries the acknowledged publisher guidance the Registry recorded", () =>
    Effect.gen(function* () {
      const world = makeWorld(null);

      const written = yield* world.provide(
        deprecate({
          ref: registryTarget,
          message: Option.some("Guidance."),
          replacement: Option.none(),
          clearMessage: false,
          clearReplacement: false,
        }),
      );

      expect(written.transition.disposition).toBe("created");
      expect(written.transition.target).toBe(registryTarget);
      expect(written.transition.after?.message).toBe("Acknowledged guidance.");
      expect(written.transition.after?.replacement).toEqual({
        status: "available",
        fqn: replacement,
      });
    }),
  );
});
