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
});
