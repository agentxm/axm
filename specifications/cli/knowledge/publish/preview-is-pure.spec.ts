import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleRootPublish } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import {
  makeFileRegistry,
  makePublishLayer,
  publishArgs,
  writeAuthoredKnowledge,
} from "../../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/publish/preview-is-pure",
  title: "Knowledge publish preview reports the admitted bundles without distributing anything",
  statement:
    "When knowledge publish runs in preview mode, it shall report the admitted workspace-authored knowledge bundles with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["cli/publish/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Publish protects the workspace and the target registry it would upload to. */
const PUBLISH_PROTECTED_STATE = [...WORKSPACE_PROTECTED_STATE, "registry"];

describe("Knowledge publish preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const publishWorkspace = (settings: { readonly knowledge?: Record<string, unknown> }) => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings,
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const preview = (workspace: ReturnType<typeof publishWorkspace>, registryUrl: string) =>
    handleRootPublish(
      publishArgs(registryUrl, {
        types: ["knowledge"],
        preview: true,
        recoveryCommand: ["knowledge", "publish"],
      }),
    ).pipe(Effect.provide(makePublishLayer(workspace)));

  it.effect(
    "a previewed knowledge publish admits the authored bundle and changes no protected state",
    () =>
      Effect.gen(function* () {
        const workspace = publishWorkspace({ knowledge: { platform: "workspace" } });
        writeAuthoredKnowledge(workspace.root, { name: "platform" });
        const registry = makeFileRegistry(workspace.root);
        const before = snapshotProtectedState(workspace.root, PUBLISH_PROTECTED_STATE);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* preview(workspace, registry.url);

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
          protectedPaths: PUBLISH_PROTECTED_STATE,
        });
        expect(registry.storedFiles()).toEqual([]);
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          contract: "publish-result-v3",
          mode: "preview",
          publicationSet: {
            status: "admitted",
            items: [{ type: "knowledge", name: "platform", participation: "publish" }],
          },
          execution: { status: "not-run", outcomes: [{ type: "knowledge", name: "platform" }] },
          counts: { selected: 1, published: 0 },
        });
      }),
  );

  it.effect(
    "a previewed knowledge publish with nothing authored reports an empty selection and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = publishWorkspace({});
        const registry = makeFileRegistry(workspace.root);
        const before = snapshotProtectedState(workspace.root, PUBLISH_PROTECTED_STATE);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* preview(workspace, registry.url);

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
          protectedPaths: PUBLISH_PROTECTED_STATE,
        });
        expect(registry.storedFiles()).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          mode: "preview",
          counts: { selected: 0, published: 0 },
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["knowledge", "publish"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["knowledge", "publish"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["knowledge", "publish"], "-y")).toBe("unrecognized");
    }),
  );
});
