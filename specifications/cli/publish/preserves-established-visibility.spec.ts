import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/preserves-established-visibility",
  title: "Publishing preserves established extension visibility",
  statement:
    "Publish shall apply an explicit visibility request only when establishing a new extension, preserve existing extension visibility when adding or verifying a version, and report which visibility was established or preserved.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/publish/command.internal.test.ts",
    "packages/cli/src/root/publish/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication visibility establishment", () => {
  for (const selection of [
    { name: "authored selection", args: {} },
    { name: "type-filtered selection", args: { types: ["skill"] } },
    { name: "glob selection", args: { selectors: ["@acme/skills/*"] } },
    { name: "explicit set", args: { selectors: ["@acme/skills/review", "@acme/skills/deploy"] } },
  ] as const) {
    it.effect(`reports new-extension visibility for ${selection.name}`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: { skills: { review: "workspace", deploy: "workspace" } },
          });
          for (const name of ["review", "deploy"])
            writeAuthoredSkill(context.workspace.root, { name });
          yield* context.run({
            ...selection.args,
            preview: true,
            visibility: Option.some("private"),
          });
          const result = yield* context.result();
          expect(result.execution.outcomes).toHaveLength(2);
          for (const outcome of result.execution.outcomes)
            expect(outcome.visibility).toEqual({
              value: "private",
              disposition: "establish",
              source: "explicit",
            });
        }),
      ),
    );
  }
  it.effect(
    "preserves the first extension while establishing a second and verifying both releases",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: { skills: { review: "workspace", deploy: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          writeAuthoredSkill(context.workspace.root, { name: "deploy" });
          yield* context.run({
            selectors: ["@acme/skills/review"],
            visibility: Option.some("public"),
          });
          const first = context.archive("review");
          writeAuthoredSkill(context.workspace.root, { name: "review", version: "1.1.0" });
          yield* context.run({ visibility: Option.some("private") });
          const published = yield* context.result();
          expect(published.execution.outcomes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: "@acme/skills/review",
                status: "success",
                visibility: {
                  value: "public",
                  disposition: "preserve",
                  source: "existing",
                },
              }),
              expect.objectContaining({
                id: "@acme/skills/deploy",
                status: "success",
                visibility: {
                  value: "private",
                  disposition: "establish",
                  source: "explicit",
                },
              }),
            ]),
          );
          expect(context.archive("review")).toEqual(first);
          expect(context.archive("review", "1.1.0").length).toBeGreaterThan(0);
          expect(context.archive("deploy").length).toBeGreaterThan(0);
          const before = context.snapshotRegistry();
          yield* context.run({ visibility: Option.some("public") });
          const verified = yield* context.result();
          expect(verified.counts).toMatchObject({ alreadyPublished: 2, published: 0, failed: 0 });
          for (const outcome of verified.execution.outcomes)
            expect(outcome.visibility).toEqual({
              value: outcome.id === "@acme/skills/deploy" ? "private" : "public",
              disposition: "preserve",
              source: "existing",
            });
          expect(context.snapshotRegistry()).toEqual(before);
        }),
      ),
  );
});
