import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type {
  GitDirectoryComparisonService,
  GitDirectoryDifference,
} from "@agentxm/extension-sources";

import {
  makePublishWorld,
  publishDocument,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/preflight-blocks-the-whole-selection",
  title: "One failed publish preflight blocks the whole selection",
  statement:
    "When any selected extension fails publish preflight, publish shall upload nothing for the selection and shall report every other publishable extension as blocked by preflight, naming the extension that failed.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["cli/publish/requires-explicit-acceptance-for-non-head-source"],
  supersedes: [],
  assumptions: [
    "The Git comparison AXM performs reports added, deleted, and modified paths accurately relative to HEAD; the source-state scenario substitutes the comparison outcome rather than running Git.",
  ],
  openQuestions: [],
});

const revision = "0123456789abcdef0123456789abcdef01234567";

const gitComparison =
  (differences: ReadonlyArray<GitDirectoryDifference>): GitDirectoryComparisonService["compare"] =>
  ({ directory }) =>
    Effect.succeed(
      Option.some({
        repositoryRoot: nodePath.dirname(nodePath.dirname(directory)),
        repositoryDirectory: `skills/${nodePath.basename(directory)}`,
        headRevision: revision,
        differences,
      }),
    );

describe("Publish preflight over a selection", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const twoSkillWorld = (options?: {
    readonly reviewWithoutContent?: boolean;
    readonly compare?: GitDirectoryComparisonService["compare"];
  }) => {
    const world = makePublishWorld({
      settings: { skills: { clean: "workspace", review: "workspace" } },
      ...(options?.compare === undefined ? {} : { compare: options.compare }),
    });
    worlds.push(world);
    world.write("skill", { name: "clean" });
    world.write("skill", {
      name: "review",
      ...(options?.reviewWithoutContent === true ? { withoutContent: true } : {}),
    });
    return world;
  };

  it.effect("blocks the complete selection when one archive needs source-state acceptance", () =>
    Effect.gen(function* () {
      const world = twoSkillWorld({
        compare: (input) =>
          gitComparison(
            nodePath.basename(input.directory) === "review"
              ? [{ path: "src/SKILL.md", change: "modified" }]
              : [],
          )(input),
      });

      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.target.storedFiles()).toEqual([]);
      expect(publishDocument(outcome)).toMatchObject({
        execution: {
          outcomes: expect.arrayContaining([
            expect.objectContaining({
              id: "@acme/skills/review",
              status: "blocked",
              reason: "source_state_not_accepted",
            }),
            expect.objectContaining({
              id: "@acme/skills/clean",
              status: "blocked",
              reason: "blocked_by_preflight",
              blockedBy: ["@acme/skills/review"],
            }),
          ]),
        },
      });
    }),
  );

  it.effect("blocks the complete selection when one extension fails the fixed gate", () =>
    Effect.gen(function* () {
      const world = twoSkillWorld({ reviewWithoutContent: true });

      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

      expect(outcome.disposition._tag).toBe("Failed");
      expect(world.target.storedFiles()).toEqual([]);
      expect(publishDocument(outcome)).toMatchObject({
        execution: {
          outcomes: expect.arrayContaining([
            expect.objectContaining({ id: "@acme/skills/review", status: "failed" }),
            expect.objectContaining({
              id: "@acme/skills/clean",
              status: "blocked",
              reason: "blocked_by_preflight",
              blockedBy: ["@acme/skills/review"],
            }),
          ]),
        },
      });
    }),
  );

  it.effect(
    "blocks an unpublished candidate when another selected immutable version conflicts",
    () =>
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
        const before = world.snapshotRegistry();

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { preview: false, onExisting: Option.some("error") })),
        );

        expect(outcome.disposition._tag).toBe("Failed");
        expect(world.snapshotRegistry()).toEqual(before);
        expect(publishDocument(outcome).execution.outcomes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "@acme/skills/review",
              status: "failed",
              reason: "version_exists",
            }),
            expect.objectContaining({
              id: "@acme/skills/deploy",
              status: "blocked",
              reason: "blocked_by_preflight",
              blockedBy: ["@acme/skills/review"],
            }),
          ]),
        );

        yield* world.provide(
          runPublish(requestFor(world, { selectors: ["@acme/skills/deploy"], preview: false })),
        );
        expect(world.archive("deploy").length).toBeGreaterThan(0);
      }),
  );
});
