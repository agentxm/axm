import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { getAppError } from "axm.sh/specification-harness";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import { writeAuthoredPack, writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/respects-local-pack-constraints",
  title: "Publication respects workspace pack constraints",
  statement:
    "When an authored member selected for publication is excluded by a workspace pack constraint, publish shall reject it in preview and apply, including existing-version verification, name the member and conflicting pack constraint, and offer a repair appropriate to the pack authority.",
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

describe("Workspace pack constraints at publication", () => {
  for (const scenario of [
    { name: "explicit apply", preview: false, selectors: ["@acme/skills/review"] },
    { name: "explicit preview", preview: true, selectors: ["@acme/skills/review"] },
    { name: "authored bulk apply", preview: false, selectors: [] },
  ]) {
    it.effect(scenario.name, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            machine: false,
            settings: { skills: { review: "workspace" }, packs: { reviewers: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review", version: "0.0.5" });
          writeAuthoredPack(context.workspace.root, {
            name: "reviewers",
            dependencies: { "@acme/skills/review": "^0.0.4" },
          });
          const error = getAppError(yield* context.run(scenario).pipe(Effect.flip));
          expect(error.code).toBe("validation");
          expect(error.detail).toContain("@acme/skills/review@0.0.5");
          expect(error.detail).toContain("@acme/packs/reviewers declares ^0.0.4");
          expect(error.suggestions).toContainEqual({
            description:
              "Replace @acme/packs/reviewers's constraint with the selected version, then publish the member and pack together",
            cmd: "axm packs add @acme/packs/reviewers @acme/skills/review",
          });
          expect(context.registry.storedFiles()).toEqual([]);
        }),
      ),
    );
  }
  it.effect(
    "publishes a coordinated repair and still checks local constraints before an immutable-version skip",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            machine: false,
            settings: { skills: { review: "workspace" }, packs: { reviewers: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review", version: "0.0.5" });
          writeAuthoredPack(context.workspace.root, {
            name: "reviewers",
            dependencies: { "@acme/skills/review": "^0.0.5" },
          });
          yield* context.run({ selectors: ["@acme/skills/review", "@acme/packs/reviewers"] });
          expect(context.archive("review", "0.0.5").length).toBeGreaterThan(0);
          expect(context.archive("reviewers", "1.0.0", "packs").length).toBeGreaterThan(0);
          const before = context.snapshotRegistry();
          writeAuthoredPack(context.workspace.root, {
            name: "reviewers",
            dependencies: { "@acme/skills/review": "^0.0.4" },
          });
          const error = getAppError(
            yield* context
              .run({ selectors: ["@acme/skills/review"], onExisting: Option.some("verify") })
              .pipe(Effect.flip),
          );
          expect(error.code).toBe("validation");
          expect(error.detail).toContain("@acme/packs/reviewers declares ^0.0.4");
          expect(context.snapshotRegistry()).toEqual(before);
        }),
      ),
  );
});
