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
  requirement: "cli/publish/preview-is-pure-and-gate-is-fixed",
  title: "Publish preview evaluates the fixed publication gate and distributes nothing",
  statement:
    "A publish preview shall report the admitted publication set without uploading anything or changing workspace state, and the fixed publication gate shall block an ineligible extension in preview and apply alike regardless of any locally relaxed lint rule.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  status: "accepted",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publish preview purity and the fixed publication gate", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "a preview reports the admitted publication set without uploading or changing state",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { skills: { review: "workspace" } },
        });
        cleanups.push(workspace.cleanup);
        writeAuthoredSkill(workspace.root, { name: "review" });
        const registry = makeFileRegistry(workspace.root);
        const settingsBefore = JSON.stringify(workspace.readSettings());
        const lockBefore = workspace.readLockfileText();

        yield* handleRootPublish(
          publishArgs(registry.url, { selectors: ["@acme/skills/review"], preview: true }),
        ).pipe(Effect.provide(makePublishLayer(workspace)));

        expect(registry.storedFiles()).toEqual([]);
        expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
        expect(workspace.readLockfileText()).toBe(lockBefore);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          contract: "publish-result-v3",
          mode: "preview",
          publicationSet: { status: "admitted" },
          execution: { status: "not-run" },
          counts: { selected: 1, published: 0 },
        });
      }),
  );

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
