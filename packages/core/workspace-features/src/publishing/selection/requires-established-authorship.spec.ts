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
  requirement: "cli/publish/requires-established-authorship",
  title: "Publish refuses extensions the workspace does not author",
  statement:
    "Publish shall distribute only extensions the workspace authors: an explicitly selected acquired extension shall fail with a conflict that suggests adopting it and upload nothing, while bulk publication shall report acquired entries as not authored and may publish eligible authored entries without uploading acquired entries.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publishing content the workspace does not author", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  /**
   * A workspace whose only configured skill is acquired from a Registry source
   * — valid installed content the workspace does not author.
   */
  const installedOnlyWorld = () => {
    const world = makePublishWorld({ settings: { skills: { review: "@acme/skills/review" } } });
    worlds.push(world);
    return world;
  };

  for (const testCase of [
    { label: "preview", preview: true },
    { label: "apply", preview: false },
  ]) {
    it.effect(
      `an explicit selection fails typed without distributing anything: ${testCase.label}`,
      () =>
        Effect.gen(function* () {
          const world = installedOnlyWorld();
          const settingsBefore = JSON.stringify(world.readSettings());

          const outcome = yield* world.provide(
            runPublish(
              requestFor(world, {
                selectors: ["@acme/skills/review"],
                preview: testCase.preview,
              }),
            ),
          );

          const failure = publishFailureOf(outcome);
          expect(failure.category).toBe("conflict");
          expect(failure.detail).toContain("not authored by this workspace");
          expect(failure.suggestions).toContainEqual(
            expect.objectContaining({ cmd: "axm adopt @acme/skills/review" }),
          );
          expect(world.target.storedFiles()).toEqual([]);
          expect(JSON.stringify(world.readSettings())).toBe(settingsBefore);
        }),
    );
  }

  it.effect(
    "a bulk publish reports the installed extension as not authored instead of selecting it",
    () =>
      Effect.gen(function* () {
        const world = installedOnlyWorld();

        const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

        expect(world.target.storedFiles()).toEqual([]);
        const document = publishDocument(outcome);
        expect(document).toMatchObject({
          contract: "publish-result-v3",
          counts: { selected: 0, published: 0 },
        });
        expect(document).toMatchObject({
          selection: {
            decisions: [
              expect.objectContaining({
                id: "@acme/skills/review",
                disposition: "not-authored",
              }),
            ],
          },
        });
      }),
  );

  it.effect("a mixed bulk selection uploads authored content and never the acquired entry", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({
        settings: { skills: { review: "@acme/skills/review", authored: "workspace" } },
      });
      worlds.push(world);
      world.write("skill", { name: "authored" });

      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));

      expect(world.target.storedFiles()).toContain("extensions/@acme/skills/authored/1.0.0.zip");
      expect(world.target.storedFiles().some((file) => file.includes("/review/"))).toBe(false);
      expect(publishDocument(outcome)).toMatchObject({
        counts: { selected: 1, published: 1 },
        selection: {
          decisions: expect.arrayContaining([
            expect.objectContaining({ id: "@acme/skills/review", disposition: "not-authored" }),
          ]),
        },
        execution: {
          outcomes: expect.arrayContaining([
            expect.objectContaining({ id: "@acme/skills/authored", status: "success" }),
          ]),
        },
      });
    }),
  );
});
