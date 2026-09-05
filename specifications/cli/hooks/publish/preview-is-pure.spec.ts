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
  writeAuthoredHook,
} from "../../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/publish/preview-is-pure",
  title: "Hook publish preview reports the admitted hooks without distributing anything",
  statement:
    "When hooks publish runs in preview mode, it shall report the admitted workspace-authored hooks with no execution and shall not upload anything to the target registry or change settings, the lockfile, or authored content.",
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

describe("Hook publish preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const publishWorkspace = (settings: { readonly hooks?: Record<string, unknown> }) => {
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
        types: ["hook"],
        preview: true,
        recoveryCommand: ["hooks", "publish"],
      }),
    ).pipe(Effect.provide(makePublishLayer(workspace)));

  it.effect(
    "a previewed hook publish admits the authored hook and changes no protected state",
    () =>
      Effect.gen(function* () {
        const workspace = publishWorkspace({ hooks: { audit: "workspace" } });
        writeAuthoredHook(workspace.root, { name: "audit" });
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
            items: [{ type: "hook", name: "audit", participation: "publish" }],
          },
          execution: { status: "not-run", outcomes: [{ type: "hook", name: "audit" }] },
          counts: { selected: 1, published: 0 },
        });
      }),
  );

  it.effect(
    "a previewed hook publish with nothing authored reports an empty selection and changes nothing",
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
      expect(yield* probeFlag(["hooks", "publish"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["hooks", "publish"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["hooks", "publish"], "-y")).toBe("unrecognized");
    }),
  );
});
