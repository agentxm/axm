import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makePublicationSpecContext } from "../../support/publication-evidence-harness.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/existing-versions-require-explicit-policy",
  title: "Existing publications are verified or rejected without being overwritten",
  statement:
    "For an already published version, publish shall reject the error policy, treat the verify policy as a successful no-op only when the newly built archive's SHA-512 integrity matches the published integrity, and reject differing content as integrity drift, with an explicit single selector defaulting to error and bulk selection defaulting to verify.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/help/topics/publish.md",
    "packages/cli/src/root/publish/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Immutable publication reconciliation", () => {
  it.effect("bulk selection verifies the existing archive and publishes only new candidates", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* makePublicationSpecContext({
          settings: { skills: { review: "workspace", deploy: "workspace" } },
        });
        writeAuthoredSkill(context.workspace.root, { name: "review" });
        writeAuthoredSkill(context.workspace.root, { name: "deploy" });
        yield* context.run({ selectors: ["@acme/skills/review"] });
        const originalArchive = context.archive("review");
        // Modification times cannot change a deterministic package archive.
        const source = path.join(context.workspace.root, "skills", "review", "src", "SKILL.md");
        fs.utimesSync(source, new Date("2001-01-01"), new Date("2001-01-01"));
        yield* context.run();
        const result = yield* context.result();
        expect(result.counts).toMatchObject({
          selected: 2,
          published: 1,
          alreadyPublished: 1,
          failed: 0,
          blocked: 0,
        });
        expect(result.execution.outcomes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "@acme/skills/review",
              action: "skip",
              status: "success",
              reason: "version_already_published",
            }),
            expect.objectContaining({
              id: "@acme/skills/deploy",
              action: "publish",
              status: "success",
            }),
          ]),
        );
        expect(context.archive("review")).toEqual(originalArchive);
        expect(context.archive("deploy").length).toBeGreaterThan(0);
      }),
    ),
  );

  for (const policy of ["implicit-error", "error", "verify", "drift"] as const) {
    it.effect(`reconciles the ${policy} case against the actual stored release`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: { skills: { review: "workspace" } },
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          yield* context.run();
          const before = context.snapshotRegistry();
          if (policy === "drift")
            fs.appendFileSync(
              path.join(context.workspace.root, "skills", "review", "src", "SKILL.md"),
              "\nDifferent release content.\n",
            );
          const exit = yield* context
            .run({
              selectors: ["@acme/skills/review"],
              onExisting:
                policy === "implicit-error"
                  ? Option.none()
                  : Option.some(policy === "error" ? "error" : "verify"),
            })
            .pipe(Effect.exit);
          expect(exit._tag).toBe(policy === "verify" ? "Success" : "Failure");
          expect(context.snapshotRegistry()).toEqual(before);
          const result = yield* context.result();
          const item = result.execution.outcomes.find(
            (candidate) => candidate.id === "@acme/skills/review",
          );
          expect(item).toMatchObject(
            policy === "verify"
              ? { action: "skip", status: "success", reason: "version_already_published" }
              : {
                  status: "failed",
                  reason: policy === "drift" ? "integrity_drift" : "version_exists",
                },
          );
        }),
      ),
    );
  }
});
