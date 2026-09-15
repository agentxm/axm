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
  requirement: "cli/publish/preserves-established-visibility",
  title: "Publishing preserves established extension visibility",
  statement:
    "Publish shall apply an explicit visibility request only when establishing a new extension, preserve existing extension visibility when adding or verifying a version, and report which visibility was established or preserved.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "apps/cli/src/root/publish/command.test.ts",
    "apps/cli/src/root/publish/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication visibility establishment", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const twoSkillWorld = () => {
    const world = makePublishWorld({
      settings: { skills: { review: "workspace", deploy: "workspace" } },
    });
    worlds.push(world);
    for (const name of ["review", "deploy"]) world.write("skill", { name });
    return world;
  };

  for (const selection of [
    { name: "authored selection", args: {} },
    { name: "type-filtered selection", args: { types: ["skill"] } },
    { name: "glob selection", args: { selectors: ["@acme/skills/*"] } },
    { name: "explicit set", args: { selectors: ["@acme/skills/review", "@acme/skills/deploy"] } },
  ] as const) {
    it.effect(`reports new-extension visibility for ${selection.name}`, () =>
      Effect.gen(function* () {
        const world = twoSkillWorld();

        const outcome = yield* world.provide(
          runPublish(
            requestFor(world, {
              ...selection.args,
              preview: true,
              visibility: Option.some("private"),
            }),
          ),
        );

        const document = publishDocument(outcome);
        expect(document.execution.outcomes).toHaveLength(2);
        for (const item of document.execution.outcomes)
          expect(item.visibility).toEqual({
            value: "private",
            disposition: "establish",
            source: "explicit",
          });
      }),
    );
  }

  it.effect(
    "preserves the first extension while establishing a second and verifying both releases",
    () =>
      Effect.gen(function* () {
        const world = twoSkillWorld();
        yield* world.provide(
          runPublish(
            requestFor(world, {
              selectors: ["@acme/skills/review"],
              preview: false,
              visibility: Option.some("public"),
            }),
          ),
        );
        const first = world.archive("review");
        world.write("skill", { name: "review", version: "1.1.0" });

        const published = yield* world.provide(
          runPublish(requestFor(world, { preview: false, visibility: Option.some("private") })),
        );

        expect(publishDocument(published).execution.outcomes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "@acme/skills/review",
              status: "success",
              visibility: { value: "public", disposition: "preserve", source: "existing" },
            }),
            expect.objectContaining({
              id: "@acme/skills/deploy",
              status: "success",
              visibility: { value: "private", disposition: "establish", source: "explicit" },
            }),
          ]),
        );
        expect(world.archive("review")).toEqual(first);
        expect(world.archive("review", "1.1.0").length).toBeGreaterThan(0);
        expect(world.archive("deploy").length).toBeGreaterThan(0);
        const before = world.snapshotRegistry();

        const verified = yield* world.provide(
          runPublish(requestFor(world, { preview: false, visibility: Option.some("public") })),
        );

        const verifiedDocument = publishDocument(verified);
        expect(verifiedDocument.counts).toMatchObject({
          alreadyPublished: 2,
          published: 0,
          failed: 0,
        });
        for (const item of verifiedDocument.execution.outcomes)
          expect(item.visibility).toEqual({
            value: item.id === "@acme/skills/deploy" ? "private" : "public",
            disposition: "preserve",
            source: "existing",
          });
        expect(world.snapshotRegistry()).toEqual(before);
      }),
  );
});
