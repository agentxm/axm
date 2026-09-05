import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleView } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace, readExtensionIndex } from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/view/returns-the-selected-field",
  title: "View can return one selected metadata field",
  statement:
    "When a caller selects a supported extension metadata field, AXM shall return that field alone in its machine result.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/view/handler.internal.test.ts",
    "packages/cli/src/root/view/handler.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selected metadata field", () => {
  for (const selection of [
    { field: "version", value: "1.1.0" },
    { field: "latest", value: "1.1.0" },
    { field: "versions", value: ["1.1.0", "1.0.0"] },
    { field: "description", value: "Review guidance" },
    { field: "owner", value: "@acme" },
    { field: "type", value: "skill" },
    { field: "visibility", value: "public" },
    { field: "deprecation", value: null },
  ])
    it.effect(selection.field, () => {
      const workspace = makeReadSpecWorkspace();
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleView({
            handle: "@acme/skills/review",
            field: Option.some(selection.field),
            registry: Option.none(),
          });
          expect(workspace.rendererState.results).toHaveLength(1);
          expect(workspace.rendererState.results[0]?.data).toEqual(selection.value);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({ body: readExtensionIndex }),
      );
    });
});
