import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import {
  type RootPublishArgs,
  writeAuthoredPack,
  writeAuthoredSkill,
} from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/selectors-and-filters-narrow-authored-candidates",
  title: "Publication selectors and filters narrow the workspace-authored set",
  statement:
    "Root publish shall select the workspace-authored candidates matching either explicit fully qualified or type-qualified selectors and globs, or the owner, type and exclusion filters on an argument-free selection, defaulting to all authored candidates and never adding unrelated candidates.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: ["packages/cli/help/topics/publish.md", "packages/cli/src/root/publish/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication selection", () => {
  const cases: ReadonlyArray<{
    name: string;
    args: Partial<RootPublishArgs>;
    expected: ReadonlyArray<string>;
  }> = [
    {
      name: "all authored entries",
      args: {},
      expected: ["@acme/packs/toolkit", "@acme/skills/deploy", "@acme/skills/review"],
    },
    {
      name: "type-qualified name",
      args: { selectors: ["skills/review"] },
      expected: ["@acme/skills/review"],
    },
    {
      name: "fully qualified name",
      args: { selectors: ["@acme/packs/toolkit"] },
      expected: ["@acme/packs/toolkit"],
    },
    {
      name: "explicit glob",
      args: { selectors: ["@acme/skills/*"] },
      expected: ["@acme/skills/deploy", "@acme/skills/review"],
    },
    { name: "type filter", args: { types: ["pack"] }, expected: ["@acme/packs/toolkit"] },
    {
      name: "owner and type filters",
      args: { owners: ["@acme"], types: ["skill"], excludes: ["@acme/skills/deploy"] },
      expected: ["@acme/skills/review"],
    },
    { name: "unmatched owner filter", args: { owners: ["@other"] }, expected: [] },
    {
      name: "overlapping explicit selectors",
      args: { selectors: ["skills/review", "@acme/skills/review", "@acme/skills/*"] },
      expected: ["@acme/skills/deploy", "@acme/skills/review"],
    },
  ];
  for (const scenario of cases) {
    it.effect(scenario.name, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: {
              skills: { review: "workspace", deploy: "workspace" },
              packs: { toolkit: "workspace" },
            },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          writeAuthoredSkill(context.workspace.root, { name: "deploy" });
          writeAuthoredPack(context.workspace.root, { name: "toolkit" });
          yield* context.run(scenario.args);
          const result = yield* context.result();
          expect(
            result.execution.outcomes
              .filter(({ status }) => status === "success")
              .map(({ id }) => id)
              .sort(),
          ).toEqual(scenario.expected);
          expect(result.counts.published).toBe(scenario.expected.length);
          expect(
            context.registry
              .storedFiles()
              .filter((file) => file.endsWith(".zip"))
              .sort(),
          ).toEqual(scenario.expected.map((id) => `extensions/${id}/1.0.0.zip`));
        }),
      ),
    );
  }
  for (const preview of [true, false]) {
    it.effect(
      `reports an empty authored selection as a no-op in ${preview ? "preview" : "apply"}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* makePublicationSpecContext();
            yield* context.run({ preview });
            const result = yield* context.result();
            expect(result.selection.mode).toBe("authored");
            expect(result.execution.outcomes).toEqual([]);
            expect(result.counts).toMatchObject({ selected: 0, published: 0, failed: 0 });
            expect(context.registry.storedFiles()).toEqual([]);
          }),
        ),
    );
    it.effect(
      `includes an authored extension disabled for installation in ${preview ? "preview" : "apply"}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* makePublicationSpecContext({
              settings: { skills: { review: { source: "workspace", enabled: false } } },
            });
            writeAuthoredSkill(context.workspace.root, { name: "review" });
            yield* context.run({ preview });
            const result = yield* context.result();
            expect(result.execution.outcomes).toEqual([
              expect.objectContaining({
                id: "@acme/skills/review",
                authored: true,
                sourceType: "workspace",
                status: preview ? "pending" : "success",
              }),
            ]);
            if (!preview) expect(context.archive("review").length).toBeGreaterThan(0);
          }),
        ),
    );
  }
});
