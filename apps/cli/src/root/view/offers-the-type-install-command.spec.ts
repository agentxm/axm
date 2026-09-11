import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";

import { authoringTypes } from "../../test-support/authoring-fixtures.js";
import { collectCommandPaths } from "../../test-support/command-tree-test-helpers.js";
import { makeReadSpecWorkspace, readExtensionIndex } from "../../test-support/read-harness.js";
import { handleView } from "./handler.js";

export const specification = defineSpecification({
  requirement: "cli/view/offers-the-type-install-command",
  title: "View offers the extension type’s install command",
  statement:
    "When viewing an installable extension, AXM shall offer an install command on the route that extension type's command group registers, so the suggestion can be run as printed.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/src/app.ts",
    "packages/core/workspace-inspection/src/view/view-extension.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * One row per extension type a Registry can publish. `mcp-server` is the
 * decisive row: its command group segment (`mcps`) differs from its type name,
 * so a suggestion built from the type name alone would not be runnable.
 */
describe("Install guidance for inspected extensions", () => {
  for (const row of authoringTypes)
    it.effect(`${row.type} is offered the ${row.plural} install route`, () => {
      const workspace = makeReadSpecWorkspace();
      const fqn = `@acme/${row.plural}/example`;
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleView({ handle: fqn, field: Option.none(), registry: Option.none() });

          expect(workspace.rendererState.results[0]?.data).toMatchObject({
            handle: fqn,
            install: `axm ${row.plural} install ${fqn}`,
          });

          // A suggested route the CLI does not register would mislead the
          // reader, so the offer is checked against the real command tree.
          const registered = yield* collectCommandPaths();
          expect(registered.has(`axm ${row.plural} install`)).toBe(true);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
        () => ({ body: { ...readExtensionIndex, type: row.type, name: "example" } }),
      );
    });
});
