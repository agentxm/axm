import * as Effect from "effect/Effect";
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
  requirement: "cli/publish/dependency-inclusion-adds-only-authored-pack-members",
  title: "Pack dependency inclusion adds only workspace-authored members",
  statement:
    "For a selected pack, publish shall add its workspace-authored dependencies only when dependency inclusion is explicitly requested, retain external dependencies as Registry references, and leave unrelated authored extensions outside the selection.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["decision-table", "example"],
  derivedFrom: ["apps/cli/help/topics/publish.md", "apps/cli/src/root/publish/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selected pack dependency inclusion", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  for (const includeDependencies of [false, true]) {
    it.effect(
      `dependency inclusion ${includeDependencies ? "adds the authored member" : "does not widen selection"}`,
      () =>
        Effect.gen(function* () {
          const world = makePublishWorld({
            settings: {
              skills: { review: "workspace", external: "workspace", unrelated: "workspace" },
              packs: { toolkit: "workspace" },
            },
          });
          worlds.push(world);
          for (const name of ["review", "external", "unrelated"]) world.write("skill", { name });
          world.write("pack", {
            name: "toolkit",
            dependencies: { "@acme/skills/review": "^1.0.0", "@acme/skills/external": "^1.0.0" },
          });

          // `external` is published first and then acquired from the Registry,
          // so the pack's remaining workspace-authored member is `review`.
          yield* world.provide(
            runPublish(
              requestFor(world, {
                selectors: ["@acme/skills/review", "@acme/skills/external"],
                preview: false,
              }),
            ),
          );
          const externalArchive = world.archive("external");
          world.writeSettings({
            owner: "@acme",
            agents: [],
            skills: {
              review: "workspace",
              external: "@acme/skills/external",
              unrelated: "workspace",
            },
            packs: { toolkit: "workspace" },
          });
          world.write("skill", { name: "review", version: "1.1.0" });

          const outcome = yield* world.provide(
            runPublish(
              requestFor(world, {
                selectors: ["@acme/packs/toolkit"],
                includeDependencies,
                acceptWarnings: true,
                preview: false,
              }),
            ),
          );

          const published = publishDocument(outcome)
            .execution.outcomes.filter(
              ({ action, status }) => action === "publish" && status === "success",
            )
            .map(({ id }) => id)
            .sort();
          expect(published).toEqual(
            includeDependencies
              ? ["@acme/packs/toolkit", "@acme/skills/review"]
              : ["@acme/packs/toolkit"],
          );
          expect(world.archive("external")).toEqual(externalArchive);
          expect(world.target.storedFiles().some((file) => file.includes("/unrelated/"))).toBe(
            false,
          );
          expect(world.target.storedFiles()).toContain("extensions/@acme/packs/toolkit/1.0.0.zip");
          expect(
            world.target.storedFiles().includes("extensions/@acme/skills/review/1.1.0.zip"),
          ).toBe(includeDependencies);
        }),
    );
  }
});
