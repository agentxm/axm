import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  archiveContents,
  makePublishWorld,
  publishDocument,
  publishFailureOf,
  requestFor,
  runPublish,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/publication-gate-is-fixed",
  title: "The publication gate is fixed and ignores locally relaxed lint rules",
  statement:
    "When a selected extension violates the fixed publication gate, publish shall block it in preview and apply alike, shall name the violated rule, and shall upload nothing, regardless of any lint rule relaxed in axm.json.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["decision-table"],
  derivedFrom: ["cli/publish/preview-is-pure-and-gate-is-fixed"],
  supersedes: ["cli/publish/preview-is-pure-and-gate-is-fixed"],
  assumptions: [],
  openQuestions: [],
});

describe("The fixed publication gate", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  /**
   * The fixed gate evaluates in preview and apply alike, and configurable
   * local lint policy cannot relax it: switching the violated rule off in
   * `axm.json` changes `axm lint`, never the distribution contract.
   */
  const gateCases = [
    { label: "preview under default local lint policy", preview: true, ruleOff: false },
    { label: "preview with the violated rule switched off locally", preview: true, ruleOff: true },
    { label: "apply under default local lint policy", preview: false, ruleOff: false },
    { label: "apply with the violated rule switched off locally", preview: false, ruleOff: true },
  ];

  it.effect.each(gateCases)("the fixed gate blocks an ineligible skill: $label", (testCase) =>
    Effect.gen(function* () {
      const world = makePublishWorld({ settings: { skills: { review: "workspace" } } });
      worlds.push(world);
      world.write("skill", { name: "review", withoutContent: true });
      if (testCase.ruleOff) world.setLintRule("skill/skill-md-present", "off");
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
      expect(failure.category).toBe("validation");
      expect(failure.detail).toContain("skill/skill-md-present");
      expect(world.target.storedFiles()).toEqual([]);
      expect(JSON.stringify(world.readSettings())).toBe(settingsBefore);
    }),
  );

  for (const scenario of [
    { name: "minimal conformant OKF 0.2", invalid: undefined, minimal: true },
    { name: "conformant OKF 0.2 with provenance", invalid: undefined, minimal: false },
    { name: "bundle-escaping provenance", invalid: "escapes the Knowledge bundle", minimal: false },
    { name: "malformed YAML frontmatter", invalid: "Invalid YAML frontmatter", minimal: false },
  ]) {
    it.effect(`validates Knowledge publication: ${scenario.name}`, () =>
      Effect.gen(function* () {
        const world = makePublishWorld({ settings: { knowledge: { platform: "workspace" } } });
        worlds.push(world);
        const packageRoot = world.write("knowledge", { name: "platform" });
        const concept = nodePath.join(packageRoot, "src", "architecture.md");
        const source = scenario.minimal
          ? "---\ntype: reference\ndescription: Platform architecture\ntags: [platform]\n---\n# Architecture\n"
          : scenario.invalid === "Invalid YAML frontmatter"
            ? "---\ntype: reference\ndescription: value: extra\n---\n# Architecture\n"
            : [
                "---",
                "type: reference",
                "description: Platform architecture",
                "tags: [platform]",
                "status: stable",
                "generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }",
                "verified: { by: human:reviewer, at: 2026-06-25T09:00:00Z }",
                "sources:",
                "  - id: adr-1",
                `    resource: ${scenario.invalid === undefined ? "./missing-adr.md" : "../outside.md"}`,
                "---",
                "# Architecture",
                "",
              ].join("\n");
        fs.writeFileSync(concept, source);

        for (const preview of [true, false]) {
          const outcome = yield* world.provide(
            runPublish(requestFor(world, { types: ["knowledge"], preview })),
          );
          expect(outcome.disposition._tag).toBe(
            scenario.invalid === undefined ? "Completed" : "Failed",
          );
          const document = publishDocument(outcome);
          if (scenario.invalid === undefined) {
            expect(document.execution.outcomes).toEqual([
              expect.objectContaining({
                id: "@acme/knowledge/platform",
                status: preview ? "pending" : "success",
              }),
            ]);
            if (!preview) {
              const contents = yield* archiveContents(
                world.archive("platform", "1.0.0", "knowledge"),
              );
              expect(contents["src/architecture.md"]).toEqual(Buffer.from(source));
            }
          } else {
            expect(JSON.stringify(document)).toContain(scenario.invalid);
            expect(world.target.storedFiles()).toEqual([]);
          }
        }
      }),
    );
  }
});
