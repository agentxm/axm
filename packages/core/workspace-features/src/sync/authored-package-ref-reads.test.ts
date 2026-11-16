/**
 * Work sync step collection does to resolve a usable workspace-authored
 * package.
 *
 * Step collection observes each desired node once; for a node it observes
 * itself, the usable ref is resolved from the manifest that observation
 * decoded, while the resolution's presence probe and package hash still run.
 * The steps are collected directly, outside a planning read view, so every
 * request is a physical read; under a read view the phase's observation
 * cache already serves the repeated physical read. Counts are exact for this
 * fixture over a real temporary workspace.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  collectMaterializeSteps,
  StepFailureConversion,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  DEFAULT_AUTHORED_DIRECTORIES,
  DesiredStateReader,
} from "@agentxm/workspace-kernel/workspace-state";

import { makeSyncFixture, writeAuthoredRule } from "../testing/sync-fixture.js";

const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

describe("Sync step collection for a workspace-authored package", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "resolves a usable authored Rule from the manifest its observation read",
    () => {
      const workspace = makeSyncFixture({
        settings: { owner: "@acme", agents: ["claude-code"], rules: { review: "workspace" } },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "review", "Review every change.");
      const packageDir = nodePath.join(workspace.root, DEFAULT_AUTHORED_DIRECTORIES.rule, "review");
      const manifestPath = nodePath.join(packageDir, "rule.json");
      return workspace
        .provide(
          Effect.gen(function* () {
            const graph = yield* (yield* DesiredStateReader).graph();
            const adapter = yield* StepFailureConversion;
            const recording = yield* FileSystemRecorder;
            const work = workObservations(false);
            const before = workspace.snapshot();
            recording.reset();
            yield* collectMaterializeSteps({
              desiredState: graph,
              selection: {
                target: Option.none(),
                types: [],
                subjects: [{ type: "rule", name: "review" }],
              },
              inventories: "presence",
              adapter,
            }).pipe(work.provide);

            expect(workspace.snapshot()).toEqual(before);
            // The observation's read and the package hash's walk; resolving the
            // usable ref decodes nothing again.
            expect(recording.contentReads(manifestPath)).toBe(2);
            // The observation's and the resolution's presence probes.
            expect(recording.counts(packageDir).access).toBe(2);
            expect(work.facts.filter((fact) => fact.kind === "axm.hash.package")).toHaveLength(1);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );
});
