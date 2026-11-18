/**
 * Instruction projection work while planning an agent addition.
 *
 * Planning the instruction step for a newly configured agent compares the
 * resulting membership's routes with the routes the prior membership already
 * had. One observation of the instruction projection answers both. One
 * observation lists the workspace root five times and reads the instruction
 * source once; the rest of the counted work belongs to the other planning
 * steps. These counts run the production planning over a real temporary
 * workspace, beneath the production file system.
 */
import * as nodePath from "node:path";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { SYNC_RECOVERY_IDS } from "@agentxm/workspace-kernel/reconciliation";
import { SyncWorkspace } from "./sync-workspace.js";
import { applySync, makeSyncFixture } from "../testing/sync-fixture.js";

const instructionWorkspace = () =>
  makeSyncFixture({
    settings: { owner: "@acme", agents: ["claude-code"], instructionFiles: {} },
    files: { "AGENTS.md": "# Root\n" },
  });

/** The recording file system replaces the platform one beneath every fixture layer. */
const provideRecording = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeServices.layer))),
  );

describe("Agent addition instruction planning", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** Plan the materialization for `request`, counting only the planning work. */
  const countPlanning = (
    root: string,
    request: Parameters<typeof SyncWorkspace.planMaterialization>[0],
  ) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const planned = yield* SyncWorkspace.planMaterialization(request);
      return {
        steps: planned.steps.map((step) => step.key),
        rootListings: recording.counts(root).readDirectory ?? 0,
        sourceReads: recording.contentReads(nodePath.join(root, "AGENTS.md")),
      };
    });

  it.effect("observes the instruction projection once for an added agent", () => {
    const workspace = instructionWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      // The membership an agent addition plans against before recording it.
      const counted = yield* workspace.provide(
        countPlanning(workspace.root, {
          configuredAgents: ["claude-code", "gemini-cli"],
          newlyConfiguredAgentIds: ["gemini-cli"],
        }),
      );
      expect(counted).toEqual({
        steps: [SYNC_RECOVERY_IDS.instructionReconcile],
        // One instruction projection observation; a second observation of
        // the prior membership would add five root listings and a source read.
        rootListings: 10,
        sourceReads: 5,
      });
    }).pipe(provideRecording);
  });

  it.effect("does no further work when no requested agent is new", () => {
    const workspace = instructionWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      const counted = yield* workspace.provide(
        countPlanning(workspace.root, {
          configuredAgents: ["claude-code"],
          newlyConfiguredAgentIds: ["claude-code"],
        }),
      );
      // One instruction projection observation, and nothing derived for a prior membership.
      expect(counted).toEqual({ steps: [], rootListings: 9, sourceReads: 5 });
    }).pipe(provideRecording);
  });
});
