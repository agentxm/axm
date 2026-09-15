import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makePublishWorld,
  publishDocument,
  publishFailureOf,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/older-unpublished-versions-require-backfill",
  title: "Older unpublished versions require explicit backfill",
  statement:
    "Publish shall reject an unpublished version below the highest published semantic version unless backfill is explicitly requested, and the refusal shall offer a version bump or intentional backfill, and backfill shall permit only an unpublished version without authorizing replacement of an existing release.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/publish/command.ts",
    "apps/cli/src/root/publish/command.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication version ordering", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const authoredWorld = () => {
    const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
    worlds.push(world);
    return world;
  };

  it.effect("uses semantic version order after an out-of-order backfill and never overwrites", () =>
    Effect.gen(function* () {
      const world = authoredWorld();
      for (const version of ["1.0.0", "2.0.0"]) {
        world.write("skill", { name: "review", version });
        yield* world.provide(
          runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
        );
      }
      world.write("skill", { name: "review", version: "1.5.0" });
      yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review"],
            preview: false,
            backfill: true,
          }),
        ),
      );
      expect(world.archive("review", "1.5.0").length).toBeGreaterThan(0);

      world.write("skill", { name: "review", version: "1.9.0" });
      const before = world.snapshotRegistry();
      const rejected = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );

      expect(rejected.disposition._tag).toBe("Failed");
      expect(publishDocument(rejected).execution.outcomes[0]).toMatchObject({
        status: "failed",
        cause: {
          code: "conflict",
          message: expect.stringContaining("highest published version 2.0.0"),
        },
      });
      expect(world.snapshotRegistry()).toEqual(before);

      yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review"],
            preview: false,
            backfill: true,
          }),
        ),
      );
      expect(world.archive("review", "1.9.0").length).toBeGreaterThan(0);
      const after = world.snapshotRegistry();

      const overwrite = yield* world.provide(
        runPublish(
          requestFor(world, {
            selectors: ["@acme/skills/review"],
            preview: false,
            backfill: true,
          }),
        ),
      );

      expect(overwrite.disposition._tag).toBe("Failed");
      expect(publishDocument(overwrite).execution.outcomes[0]).toMatchObject({
        status: "failed",
        cause: {
          code: "conflict",
          message: expect.stringContaining("already published"),
        },
      });
      expect(world.snapshotRegistry()).toEqual(after);
    }),
  );

  it.effect("offers a version bump or explicit backfill when rejecting an older version", () =>
    Effect.gen(function* () {
      const world = authoredWorld();
      world.write("skill", { name: "review", version: "1.1.0" });
      yield* world.provide(runPublish(requestFor(world, { preview: false })));
      world.write("skill", { name: "review", version: "1.0.5" });

      const outcome = yield* world.provide(
        runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
      );

      const failure = publishFailureOf(outcome);
      expect(failure.category).toBe("conflict");
      expect(failure.detail).toContain("highest published version 1.1.0");
      expect(failure.suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cmd: "axm version @acme/skills/review patch" }),
          expect.objectContaining({ description: expect.stringContaining("--backfill") }),
        ]),
      );
    }),
  );
});
