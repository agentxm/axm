import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleRootPublish } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { makeFileRegistry, makePublishLayer, publishArgs } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/requires-established-authorship",
  title: "Publish refuses extensions the workspace does not author",
  statement:
    "Publish shall distribute only extensions the workspace authors: an explicitly selected installed extension shall fail with a conflict that suggests adopting it, a bulk publish shall report it as not authored rather than selecting it, and nothing shall be uploaded either way.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  status: "accepted",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * A workspace whose only configured skill is acquired from a Registry source
 * — valid installed content the workspace does not author.
 */
const installedOnlyWorkspace = (options?: Parameters<typeof makeSpecWorkspace>[0]) =>
  makeSpecWorkspace({
    ...options,
    settings: { skills: { review: "@acme/skills/review" } },
  });

describe("Publishing content the workspace does not author", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const explicitCases = [
    { label: "preview", preview: true },
    { label: "apply", preview: false },
  ];

  it.effect.each(explicitCases)(
    "an explicit selection fails typed without distributing anything: $label",
    (testCase) =>
      Effect.gen(function* () {
        const workspace = installedOnlyWorkspace();
        cleanups.push(workspace.cleanup);
        const registry = makeFileRegistry(workspace.root);
        const settingsBefore = JSON.stringify(workspace.readSettings());

        const failure = yield* handleRootPublish(
          publishArgs(registry.url, {
            selectors: ["@acme/skills/review"],
            preview: testCase.preview,
          }),
        ).pipe(Effect.provide(makePublishLayer(workspace)), Effect.flip);

        const error = getAppError(failure);
        expect(error.code).toBe("conflict");
        expect(error.detail).toContain("not authored by this workspace");
        expect(error.suggestions).toContainEqual(
          expect.objectContaining({ cmd: "axm adopt @acme/skills/review" }),
        );
        expect(registry.storedFiles()).toEqual([]);
        expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      }),
  );

  it.effect(
    "a bulk publish reports the installed extension as not authored instead of selecting it",
    () =>
      Effect.gen(function* () {
        const workspace = installedOnlyWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        const registry = makeFileRegistry(workspace.root);

        yield* handleRootPublish(publishArgs(registry.url, { preview: false })).pipe(
          Effect.provide(makePublishLayer(workspace)),
        );

        expect(registry.storedFiles()).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          contract: "publish-result-v3",
          counts: { selected: 0, published: 0 },
        });
        expect(entry?.data).toMatchObject({
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
});
