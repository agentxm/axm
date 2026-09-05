import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleDeprecate, LifecycleTransitionOutputSchema } from "axm.sh/specification-harness";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  observedRevision,
  registryTarget,
  registryTargetPath,
} from "../../support/registry-management-harness.js";

export const specification = defineSpecification({
  requirement: "cli/deprecate/updates-guidance-at-the-observed-revision",
  title: "Deprecation edits preserve omitted guidance at the observed revision",
  statement:
    "The deprecate command shall compose the requested message and replacement edits with the observed guidance, preserve omitted and concealed replacement information, condition the write on the observed revision, and report the Registry's acknowledged transition with publisher guidance presented as result information.",
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
const makeContext = (current: unknown, machine = true) =>
  makeRegistryManagementContext(
    (request) => {
      expect(request.url.pathname).toBe(`${registryTargetPath}/deprecation`);
      return jsonRegistryResponse(
        request.method === "GET"
          ? { deprecation: current, revision: observedRevision }
          : acknowledgement,
      );
    },
    { machine },
  );

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
          const context = makeContext(scenario.current);
          yield* context.provide(
            handleDeprecate({
              ref: registryTarget,
              message: scenario.message,
              replacement: scenario.replacement,
              clearMessage: scenario.clearMessage,
              clearReplacement: scenario.clearReplacement,
            }),
          );
          expect(context.requests.map(({ method }) => method)).toEqual(["GET", "PUT"]);
          expect(context.requests[1]).toMatchObject({
            ifMatch: observedRevision,
            body: scenario.expected,
          });
          expect(context.rendererState.results).toHaveLength(1);
          const output = yield* Schema.encodeUnknownEffect(LifecycleTransitionOutputSchema)(
            context.rendererState.results[0]?.data,
          );
          expect(output).toEqual(acknowledgement);
        }),
    );
  }
  it.effect("presents acknowledged publisher guidance as information in human output", () =>
    Effect.gen(function* () {
      const context = makeContext(null, false);
      yield* context.provide(
        handleDeprecate({
          ref: registryTarget,
          message: Option.some("Guidance."),
          replacement: Option.none(),
          clearMessage: false,
          clearReplacement: false,
        }),
      );
      expect(context.rendererState.logs).toEqual(
        expect.arrayContaining([
          { _tag: "success", message: `Deprecated ${registryTarget}.` },
          { _tag: "info", message: "Message: Acknowledged guidance." },
          { _tag: "info", message: `Replacement: ${replacement}` },
        ]),
      );
      expect(context.rendererState.logs.filter((entry) => entry._tag === "warn")).toEqual([]);
    }),
  );
});
