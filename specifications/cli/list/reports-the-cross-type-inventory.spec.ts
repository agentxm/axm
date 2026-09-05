import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import { handleList, ExtensionListDocumentSchema } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/list/reports-the-cross-type-inventory",
  title: "List reports the current inventory across extension types",
  statement:
    "When listing extensions, AXM shall report the current local inventory across all extension types or only the explicitly selected type, including configured extensions that are disabled or missing.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/list/command.internal.test.ts",
    "packages/cli/src/root/list/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Cross-type local inventory", () => {
  it.effect(
    "distinguishes configured, enabled, and installed state while filtering by type",
    () => {
      const workspace = makeReadSpecWorkspace({
        settings: {
          skills: { review: { source: "@acme/skills/review", enabled: false } },
          hooks: { audit: { source: "@acme/hooks/audit", enabled: true } },
        },
      });
      return workspace.provide(
        Effect.gen(function* () {
          const read = () =>
            Schema.decodeUnknownSync(Schema.toType(ExtensionListDocumentSchema))(
              workspace.rendererState.results.at(-1)?.data,
            );
          yield* handleList({ type: Option.none(), outdated: false, deprecated: false });
          expect(read()).toMatchObject({ filter: "all", count: 2, totalCount: 2 });
          expect(read().items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: "skill",
                name: "review",
                management: "configured",
                enabled: false,
                installed: false,
              }),
              expect.objectContaining({
                type: "hook",
                name: "audit",
                management: "configured",
                enabled: true,
                installed: false,
              }),
            ]),
          );
          yield* handleList({ type: Option.some("skill"), outdated: false, deprecated: false });
          expect(read()).toMatchObject({ count: 1, items: [{ type: "skill", name: "review" }] });
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    },
  );
});
