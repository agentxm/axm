import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleRootPublish } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  makeFileRegistry,
  makePublishLayer,
  publishArgs,
  writeAuthoredSkill,
} from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/preview-is-pure",
  title: "Publish preview reports the admitted publication set without distributing anything",
  statement:
    "When publish runs in preview mode, it shall report the admitted publication set with no execution and shall not upload anything or change settings or the lockfile.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["cli/publish/preview-is-pure-and-gate-is-fixed"],
  supersedes: ["cli/publish/preview-is-pure-and-gate-is-fixed"],
  assumptions: [],
  openQuestions: [],
});

describe("Publish preview purity", () => {
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
});
