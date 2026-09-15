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
  requirement: "cli/publish/reports-pack-resolution-differences",
  title: "Publication reports differing workspace and consumer versions",
  statement:
    "When an admitted authored pack has a dependency whose effective Registry version differs from the satisfying version in this workspace, publish shall report both versions and the dependency constraint as a warning with guidance for reconciling the difference, without treating that warning as a publication failure.",
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

describe("Pack dependency resolution advisories", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  for (const scenario of [
    { name: "pack only with differing resolution", localVersion: "1.1.0", includeUnrelated: false },
    {
      name: "pack plus another extension with differing resolution",
      localVersion: "1.1.0",
      includeUnrelated: true,
    },
    {
      name: "matching workspace and Registry versions",
      localVersion: "1.0.0",
      includeUnrelated: false,
    },
  ]) {
    it.effect(scenario.name, () =>
      Effect.gen(function* () {
        const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
        worlds.push(world);
        world.write("skill", { name: "review" });
        yield* world.provide(runPublish(requestFor(world, { preview: false })));
        const oldRelease = world.archive("review");
        world.writeSettings({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace", deploy: "workspace" },
          packs: { reviewers: "workspace" },
        });
        world.write("skill", { name: "review", version: scenario.localVersion });
        world.write("skill", { name: "deploy" });
        world.write("pack", {
          name: "reviewers",
          dependencies: { "@acme/skills/review": "^1.0.0" },
        });
        const selectors = scenario.includeUnrelated
          ? ["@acme/packs/reviewers", "@acme/skills/deploy"]
          : ["@acme/packs/reviewers"];

        for (const preview of [true, false]) {
          const outcome = yield* world.provide(
            runPublish(requestFor(world, { selectors, preview })),
          );
          const pack = publishDocument(outcome).execution.outcomes.find(
            (item) => item.id === "@acme/packs/reviewers",
          );
          const warnings =
            pack?.findings?.filter(
              (finding) => finding.ruleId === "pack/publish-resolution-divergence",
            ) ?? [];
          expect(pack?.status).toBe(preview ? "pending" : "success");
          if (scenario.localVersion === "1.0.0") expect(warnings).toEqual([]);
          else
            expect(warnings).toEqual([
              {
                ruleId: "pack/publish-resolution-divergence",
                severity: "warning",
                message:
                  "@acme/packs/reviewers resolves @acme/skills/review@1.1.0 in this workspace, while Registry consumers resolve @acme/skills/review@1.0.0 within ^1.0.0.",
                suggestions: [
                  {
                    description:
                      "Publish @acme/skills/review before publishing the pack if consumers should receive the workspace version",
                    cmd: "axm publish @acme/skills/review",
                  },
                ],
              },
            ]);
        }
        expect(world.archive("review")).toEqual(oldRelease);
        expect(world.archive("reviewers", "1.0.0", "packs").length).toBeGreaterThan(0);
        expect(world.target.storedFiles().some((file) => file.endsWith("review/1.1.0.zip"))).toBe(
          false,
        );
      }),
    );
  }
});
