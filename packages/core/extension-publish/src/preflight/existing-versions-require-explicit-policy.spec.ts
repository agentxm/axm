import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/existing-versions-require-explicit-policy",
  title: "Existing publications are verified or rejected without being overwritten",
  statement:
    "For an already published version, publish shall reject the error policy, treat the verify policy as a successful no-op only when the newly built archive's SHA-512 integrity matches the published integrity, and reject differing content as integrity drift, with an explicit single selector defaulting to error and bulk selection defaulting to verify.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: ["apps/cli/help/topics/publish.md", "apps/cli/src/root/publish/command.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Immutable publication reconciliation", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  it.effect("bulk selection verifies the existing archive and publishes only new candidates", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({
        settings: { skills: { review: "workspace", deploy: "workspace" } },
      });
      worlds.push(world);
      world.write("skill", { name: "review" });
      world.write("skill", { name: "deploy" });
      yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );
      const originalArchive = world.archive("review");
      // Modification times cannot change a deterministic package archive.
      const source = nodePath.join(world.root, "skills", "review", "src", "SKILL.md");
      fs.utimesSync(source, new Date("2001-01-01"), new Date("2001-01-01"));

      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

      const document = publishDocument(outcome);
      expect(document.counts).toMatchObject({
        selected: 2,
        published: 1,
        alreadyPublished: 1,
        failed: 0,
        blocked: 0,
      });
      expect(document.execution.outcomes).toEqual(
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
      expect(world.archive("review")).toEqual(originalArchive);
      expect(world.archive("deploy").length).toBeGreaterThan(0);
    }),
  );

  for (const policy of ["implicit-error", "error", "verify", "drift"] as const) {
    it.effect(`reconciles the ${policy} case against the actual stored release`, () =>
      Effect.gen(function* () {
        const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
        worlds.push(world);
        world.write("skill", { name: "review" });
        yield* world.provide(runPublish(requestFor(world, { preview: false })));
        const before = world.snapshotRegistry();
        if (policy === "drift")
          fs.appendFileSync(
            nodePath.join(world.root, "skills", "review", "src", "SKILL.md"),
            "\nDifferent release content.\n",
          );

        const outcome = yield* world.provide(
          runPublish(
            requestFor(world, {
              selectors: ["@acme/skills/review"],
              preview: false,
              onExisting:
                policy === "implicit-error"
                  ? Option.none()
                  : Option.some(policy === "error" ? "error" : "verify"),
            }),
          ),
        );

        expect(outcome.disposition._tag).toBe(policy === "verify" ? "Completed" : "Failed");
        expect(world.snapshotRegistry()).toEqual(before);
        const item = publishDocument(outcome).execution.outcomes.find(
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
    );
  }
});
