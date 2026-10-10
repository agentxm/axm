import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { defineSpecification } from "@agentxm/specification-metadata";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";
import { resolveRootActivationIntent } from "./root-intent.js";
import { previewActivation, workspaceWithAuthoredExtension } from "./test-helpers.js";
import { EnableExtension } from "./set-activation.js";

export const specification = defineSpecification({
  requirement: "cli/root-activation-accepts-unversioned-fqns",
  title: "Root activation names an unversioned extension identity",
  statement:
    "Root enable and disable shall accept an unversioned FQN for every installable extension type, route it through the same activation use case as the typed form, and reject other target grammar as usage before workspace work. A fully qualified target shall never change an extension with a different owner. Preview shall leave durable state unchanged.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: ["cli/activation-follows-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Root activation identity", () => {
  for (const type of installableExtensionTypes)
    it.effect(type, () => {
      const fixture = workspaceWithAuthoredExtension({ type, name: "example", enabled: false });
      const fqn = `@acme/${toExtensionTypePlural(type)}/example`;
      return fixture
        .provide(
          Effect.gen(function* () {
            expect(yield* resolveRootActivationIntent(fqn)).toMatchObject({
              type,
              name: "example",
              owner: "@acme",
              fqn,
            });
            const before = fixture.snapshot();
            const preview = yield* previewActivation({ type, name: fqn, enabled: true });
            expect(preview._tag).not.toBe("Unchanged");
            if (preview._tag !== "Unchanged") expect(preview.outcome).toBe("previewed");
            expect(fixture.snapshot()).toEqual(before);
            const mismatch = yield* Effect.result(
              EnableExtension.prepare({
                type,
                name: `@outsider/${toExtensionTypePlural(type)}/example`,
              }),
            );
            if (Result.isSuccess(mismatch)) {
              expect(mismatch.success).toMatchObject({ _tag: "Unchanged" });
            } else {
              expect(mismatch.failure).toMatchObject({ category: "not_found" });
            }
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  it.effect.each([
    "example",
    "./example",
    "@acme/widgets/example",
    "@acme/skills/example@1.0.0",
    "@acme/skills/example@^1.0.0",
    "@acme/skills/example@",
  ])("rejects %s as usage without workspace services", (input) =>
    Effect.gen(function* () {
      const failure = yield* resolveRootActivationIntent(input).pipe(Effect.flip);
      expect(failure).toMatchObject({
        category: "usage",
        detail: expect.stringContaining("unversioned extension FQN"),
      });
    }),
  );
});
