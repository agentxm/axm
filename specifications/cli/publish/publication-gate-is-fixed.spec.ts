import * as fs from "node:fs";
import * as path from "node:path";
import {
  makePublicationSpecContext,
  archiveContents,
} from "../../support/publication-evidence-harness.js";
import { writeAuthoredKnowledge } from "../../support/publish-harness.js";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleRootPublish } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  makeFileRegistry,
  makePublishLayer,
  publishArgs,
  setWorkspaceLintRule,
  writeAuthoredSkill,
} from "../../support/publish-harness.js";

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
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
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
      const workspace = makeSpecWorkspace({
        settings: { skills: { review: "workspace" } },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSkill(workspace.root, { name: "review", withSkillMd: false });
      if (testCase.ruleOff) {
        setWorkspaceLintRule(workspace.root, "skill/skill-md-present", "off");
      }
      const registry = makeFileRegistry(workspace.root);
      const settingsBefore = JSON.stringify(workspace.readSettings());

      const failure = yield* handleRootPublish(
        publishArgs(registry.url, {
          selectors: ["@acme/skills/review"],
          preview: testCase.preview,
        }),
      ).pipe(Effect.provide(makePublishLayer(workspace)), Effect.flip);

      const error = getAppError(failure);
      expect(error.code).toBe("validation");
      expect(error.detail).toContain("skill/skill-md-present");
      expect(registry.storedFiles()).toEqual([]);
      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
    }),
  );
  for (const scenario of [
    { name: "minimal conformant OKF 0.2", invalid: undefined, minimal: true },
    { name: "conformant OKF 0.2 with provenance", invalid: undefined, minimal: false },
    { name: "bundle-escaping provenance", invalid: "escapes the Knowledge bundle", minimal: false },
    { name: "malformed YAML frontmatter", invalid: "Invalid YAML frontmatter", minimal: false },
  ]) {
    it.effect(`validates Knowledge publication: ${scenario.name}`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makePublicationSpecContext({
            settings: { knowledge: { platform: "workspace" } },
          });
          writeAuthoredKnowledge(context.workspace.root, { name: "platform" });
          const concept = path.join(
            context.workspace.root,
            "knowledge",
            "platform",
            "src",
            "architecture.md",
          );
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
            const exit = yield* context.run({ types: ["knowledge"], preview }).pipe(Effect.exit);
            expect(exit._tag).toBe(scenario.invalid === undefined ? "Success" : "Failure");
            const result = yield* context.result();
            if (scenario.invalid === undefined) {
              expect(result.execution.outcomes).toEqual([
                expect.objectContaining({
                  id: "@acme/knowledge/platform",
                  status: preview ? "pending" : "success",
                }),
              ]);
              if (!preview) {
                const contents = yield* archiveContents(
                  context.archive("platform", "1.0.0", "knowledge"),
                );
                expect(contents["src/architecture.md"]).toEqual(Buffer.from(source));
              }
            } else {
              expect(JSON.stringify(result)).toContain(scenario.invalid);
              expect(context.registry.storedFiles()).toEqual([]);
            }
          }
        }),
      ),
    );
  }
});
