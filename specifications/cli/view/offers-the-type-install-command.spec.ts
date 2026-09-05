import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleView } from "axm.sh/specification-harness";
import { authoringTypes } from "../../support/authoring-fixtures.js";
import { makeReadSpecWorkspace, readExtensionIndex } from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/view/offers-the-type-install-command",
  title: "View offers the extension type\u2019s install command",
  statement:
    "When viewing an installable extension, AXM shall offer an install command registered by that extension\u2019s CLI command group.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/view/handler.internal.test.ts",
    "packages/cli/src/root/shared/per-type-install.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Install guidance for inspected extensions", () => {
  for (const row of authoringTypes)
    it.effect(row.type, () => {
      const workspace = makeReadSpecWorkspace();
      const fqn = `@acme/${row.plural}/example`;
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleView({ handle: fqn, field: Option.none(), registry: Option.none() });
          expect(workspace.rendererState.results[0]?.data).toMatchObject({
            handle: fqn,
            install: `axm ${row.plural} install ${fqn}`,
          });
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({ body: { ...readExtensionIndex, type: row.type, name: "example" } }),
      );
    });
});
