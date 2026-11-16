/**
 * Withdrawal planning work for a disabled MCP connection that is still active
 * in an agent's native file. The disabled connection's inspection resolves the
 * configured targets and reads each native file; the withdrawal preview plans
 * from that observation instead of resolving and reading again, and still
 * renders, preflights and re-reads each container live. These counts run the
 * production planning over a real temporary workspace, beneath the production
 * file system.
 */
import * as nodePath from "node:path";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { withLocalAssessmentReadView } from "../inspection/show/content-read-view.js";
import { SyncWorkspace } from "./sync-workspace.js";
import { applySync, makeSyncFixture, syncRequest } from "../testing/sync-fixture.js";

const connection = { transport: "stdio", command: "node", args: ["review.js"] } as const;

/** A workspace whose `review` connection is projected, then disabled in settings only. */
const disabledWorkspace = () =>
  makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      mcpServers: { review: { connection, enabled: true } },
    },
  });

/** The recording file system replaces the platform one beneath every fixture layer. */
const provideRecording = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeServices.layer))),
  );

describe("Disabled MCP withdrawal planning", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** Count `measured` alone, after the projection and the disabling settings edit. */
  const countAfterDisabling = <A, E, R>(
    workspace: ReturnType<typeof disabledWorkspace>,
    disable: boolean,
    measured: Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      yield* workspace.provide(applySync());
      if (disable)
        workspace.writeSettings({
          ...workspace.readSettings(),
          mcpServers: { review: { connection, enabled: false } },
        });
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const result = yield* workspace.provide(measured);
      const native = nodePath.join(workspace.root, ".mcp.json");
      return {
        result,
        reads: recording.contentReads(native),
        realPaths: recording.counts(native).realPath ?? 0,
        stats: recording.counts(native).stat ?? 0,
        // A configured-target resolution or a co-reader preflight captures this catalog reader location.
        captures: recording.counts(nodePath.join(workspace.root, ".cursor/mcp.json")).realPath ?? 0,
      };
    });

  it.effect("plans an agent addition's withdrawal from the inspection's observation", () => {
    const workspace = disabledWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const counted = yield* countAfterDisabling(
        workspace,
        true,
        SyncWorkspace.planMaterialization({ configuredAgents: ["claude-code"] }).pipe(
          Effect.map((planned) =>
            planned.steps.map((step) => [step.key, step.readiness, step.artifact?.path]),
          ),
        ),
      );
      expect(counted).toEqual({
        result: [
          ["mcp-server:disable:review", "ready", nodePath.join(workspace.root, ".mcp.json")],
        ],
        // The inspection's read, the preview's live render and dry-run readback, and the
        // readback's consumer check; the preview's own resolution and first read are gone
        // (seven reads before).
        reads: 5,
        realPaths: 24,
        stats: 18,
        // The inspection's resolution and the preview's two co-reader preflights; the preview's own
        // resolution is gone (four before).
        captures: 3,
      });
    }).pipe(provideRecording);
  });

  it.effect("does no withdrawal work for a disabled connection already withdrawn", () => {
    const workspace = disabledWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      workspace.writeSettings({
        ...workspace.readSettings(),
        mcpServers: { review: { connection, enabled: false } },
      });
      const counted = yield* countAfterDisabling(
        workspace,
        false,
        SyncWorkspace.planMaterialization({ configuredAgents: ["claude-code"] }).pipe(
          Effect.map((planned) => planned.steps.map((step) => step.key)),
        ),
      );
      // A current inspection plans no withdrawal and copies nothing for one.
      expect(counted).toEqual({ result: [], reads: 2, realPaths: 3, stats: 1, captures: 1 });
    }).pipe(provideRecording);
  });

  it.effect("plans check's withdrawal from the inspection's observation", () => {
    const workspace = disabledWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const counted = yield* countAfterDisabling(
        workspace,
        true,
        withLocalAssessmentReadView(
          SyncWorkspace.assessLocalMaterialization({ target: syncRequest().target, types: [] }),
        ).pipe(
          Effect.map((assessed) =>
            assessed.steps.map((step) => [step.key, step.readiness, step.message]),
          ),
        ),
      );
      expect(counted).toEqual({
        result: [["mcp-server:disable:review", "ready", undefined]],
        // The assessment's content view already served repeated bytes from one read.
        reads: 1,
        // Its identity probes of the preview's resolution and first read are gone
        // (43 realPaths, 34 stats and seven captures before).
        realPaths: 38,
        stats: 31,
        captures: 6,
      });
    }).pipe(provideRecording);
  });

  it.effect("keeps a sync preparation's physical reads within its observation phase", () => {
    const workspace = disabledWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const counted = yield* countAfterDisabling(
        workspace,
        true,
        SyncWorkspace.prepare(syncRequest()).pipe(Effect.map((candidate) => candidate._tag)),
      );
      // Each observation phase already read the file and resolved its targets once physically.
      expect(counted).toEqual({
        result: "SyncWorkspace",
        reads: 2,
        realPaths: 4,
        stats: 2,
        captures: 2,
      });
    }).pipe(provideRecording);
  });
});
