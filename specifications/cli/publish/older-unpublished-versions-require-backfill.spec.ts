import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/older-unpublished-versions-require-backfill",
  title: "Older unpublished versions require explicit backfill",
  statement:
    "Publish shall reject an unpublished version below the highest published semantic version unless backfill is explicitly requested, and backfill shall permit only an unpublished version without authorizing replacement of an existing release.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/publish/command.ts",
    "packages/cli/src/root/publish/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication version ordering", () => {
  it.effect("uses semantic version order after an out-of-order backfill and never overwrites", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* makePublicationSpecContext({
          settings: { skills: { review: "workspace" } },
        });
        for (const version of ["1.0.0", "2.0.0"]) {
          writeAuthoredSkill(context.workspace.root, { name: "review", version });
          yield* context.run({ selectors: ["@acme/skills/review"] });
        }
        writeAuthoredSkill(context.workspace.root, { name: "review", version: "1.5.0" });
        yield* context.run({ selectors: ["@acme/skills/review"], backfill: true });
        expect(context.archive("review", "1.5.0").length).toBeGreaterThan(0);
        writeAuthoredSkill(context.workspace.root, { name: "review", version: "1.9.0" });
        const before = context.snapshotRegistry();
        const failure = yield* context
          .run({ selectors: ["@acme/skills/review"] })
          .pipe(Effect.exit);
        expect(failure._tag).toBe("Failure");
        const rejected = yield* context.result();
        expect(rejected.execution.outcomes[0]).toMatchObject({
          status: "failed",
          cause: {
            code: "conflict",
            message: expect.stringContaining("highest published version 2.0.0"),
          },
        });
        expect(context.snapshotRegistry()).toEqual(before);
        yield* context.run({ selectors: ["@acme/skills/review"], backfill: true });
        expect(context.archive("review", "1.9.0").length).toBeGreaterThan(0);
        const after = context.snapshotRegistry();
        const overwrite = yield* context
          .run({ selectors: ["@acme/skills/review"], backfill: true })
          .pipe(Effect.exit);
        expect(overwrite._tag).toBe("Failure");
        const existing = yield* context.result();
        expect(existing.execution.outcomes[0]).toMatchObject({
          status: "failed",
          cause: {
            code: "conflict",
            message: expect.stringContaining("already published"),
          },
        });
        expect(context.snapshotRegistry()).toEqual(after);
      }),
    ),
  );
});
