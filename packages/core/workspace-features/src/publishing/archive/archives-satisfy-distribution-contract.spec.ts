import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makePublishWorld,
  publishFailureOf,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/archives-satisfy-distribution-contract",
  title: "Publication refuses incomplete or unsafe archives",
  statement:
    "Before uploading an extension, publish shall reject an archive that omits a required package file includes a node_modules entry or .env file, or retains a link to excluded content, identify the invalid path, and give removal guidance for unsafe entries.",
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

describe("Publication archive admission", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  it.effect("refuses the superseded publication field before upload", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
      worlds.push(world);
      const packageRoot = world.write("skill", { name: "review" });
      const file = nodePath.join(packageRoot, "skill.json");
      const manifest: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof manifest !== "object" || manifest === null) throw new Error("Expected manifest");
      fs.writeFileSync(file, JSON.stringify({ ...manifest, publish: { ignore: [] } }));
      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));
      expect(publishFailureOf(outcome).category).toBe("validation");
      expect(world.target.storedFiles()).toEqual([]);
    }),
  );

  it.effect("refuses a retained link whose target was excluded", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
      worlds.push(world);
      const packageRoot = world.write("skill", { name: "review", publishExclude: ["draft.txt"] });
      fs.writeFileSync(nodePath.join(packageRoot, "draft.txt"), "unpublished");
      fs.symlinkSync("draft.txt", nodePath.join(packageRoot, "draft-link"));
      const outcome = yield* world.provide(runPublish(requestFor(world, { preview: false })));
      expect(publishFailureOf(outcome).detail).toContain(
        'Retained link "draft-link" points to excluded content "draft.txt"',
      );
      expect(world.target.storedFiles()).toEqual([]);
    }),
  );

  for (const scenario of [
    {
      name: "required skill content ignored",
      ignore: ["src/SKILL.md"],
      extra: undefined,
      message: "src/SKILL.md is required",
    },
    {
      name: "dependency directory included",
      ignore: [],
      extra: "node_modules/leftover.js",
      message: "node_modules/leftover.js",
    },
    { name: "environment file included", ignore: [], extra: ".env", message: ".env" },
  ]) {
    it.effect(scenario.name, () =>
      Effect.gen(function* () {
        const world = makePublishWorld({
          settings: { skills: { review: "workspace" } },
        });
        worlds.push(world);
        const packageRoot = world.write("skill", {
          name: "review",
          publishExclude: scenario.ignore,
        });
        if (scenario.extra !== undefined) {
          const file = nodePath.join(packageRoot, scenario.extra);
          fs.mkdirSync(nodePath.dirname(file), { recursive: true });
          fs.writeFileSync(file, "SYNTHETIC_PACKAGE_CONTENT");
        }

        const outcome = yield* world.provide(
          runPublish(requestFor(world, { selectors: ["@acme/skills/review"], preview: false })),
        );

        const failure = publishFailureOf(outcome);
        expect(failure.category).toBe("validation");
        expect(failure.detail).toContain(scenario.message);
        if (scenario.extra !== undefined)
          expect(failure.suggestions).toContainEqual({
            description: "Remove the unsafe entry from the extension directory.",
          });
        expect(world.target.storedFiles()).toEqual([]);
      }),
    );
  }
});
