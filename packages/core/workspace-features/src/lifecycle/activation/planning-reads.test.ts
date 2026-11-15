/**
 * Work activation planning does once per subject.
 *
 * Planning an enable collects the materialize steps for the resulting graph.
 * Activation reads only the steps and prepared projections of that collection,
 * so the collection reads each type's inventory for presence and paths alone:
 * the pre-change native outcomes a detailed inventory adds are never consumed.
 * Counts are exact for these fixtures over a real temporary workspace and a
 * `file://` Registry, beneath the production read views.
 */
import * as nodePath from "node:path";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { WorkspaceReadViews, WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";

import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import { EnableExtension } from "./set-activation.js";
import { applyActivationAcceptingExecutionChanges } from "./test-helpers.js";

const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

/** Count the inventory reads that ask for native detail, by type, through every read phase. */
const countingDetailedInventories = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  counts: Map<ExtensionType, number>,
) =>
  Effect.gen(function* () {
    const views = yield* WorkspaceReadViews;
    const count = (records: Context.Service.Shape<typeof WorkspaceRecords>) => ({
      ...records,
      getExtensionInventory: (
        type: Parameters<typeof records.getExtensionInventory>[0],
        options: Parameters<typeof records.getExtensionInventory>[1],
      ) =>
        Effect.sync(() => {
          if (options.details === true) counts.set(type, (counts.get(type) ?? 0) + 1);
        }).pipe(Effect.andThen(records.getExtensionInventory(type, options))),
    });
    const records = yield* WorkspaceRecords;
    return yield* effect.pipe(
      Effect.provideService(WorkspaceRecords, count(records)),
      Effect.provideService(WorkspaceReadViews, {
        ...views,
        capture: (options) =>
          views
            .capture(options)
            .pipe(
              Effect.map((context) =>
                Context.add(
                  context,
                  WorkspaceRecords,
                  count(Context.get(context, WorkspaceRecords)),
                ),
              ),
            ),
      }),
    );
  });

/** Run `setup`, forget its work, then count what preparing `measured` reads. */
const measure = <A, E, R>(
  world: InstallWorld,
  setup: Effect.Effect<unknown, unknown, R>,
  measured: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    yield* setup;
    recording.reset();
    const detailed = new Map<ExtensionType, number>();
    const work = workObservations(false);
    const result = yield* countingDetailedInventories(measured, detailed).pipe(work.provide);
    return {
      result,
      detailedMcpInventories: detailed.get("mcp-server") ?? 0,
      mcpConfigReads: recording.contentReads(nodePath.join(world.workspace.root, ".mcp.json")),
      facts: work.facts,
    };
  }).pipe(world.workspace.provide, Effect.provide(recordedNodeServices));

/** The materialize steps a prepared activation plans, by key and readiness. */
const stepsOf = (candidate: Effect.Success<ReturnType<typeof EnableExtension.prepare>>) =>
  candidate._tag === "Unchanged"
    ? []
    : Option.match(candidate.realization.materialization, {
        onNone: () => [],
        onSome: (collected) =>
          collected.steps.map((step) => ({ key: step.key, readiness: step.readiness })),
      });

describe("Activation planning reads each type's inventory for presence only", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    created.registry.writeMcp("context", [{ version: "1.0.0" }]);
    return created;
  };
  const installContext = applyInstallAcceptingExecutionChanges(
    installRequest({
      type: "mcp-server",
      subject: { kind: "source", source: "test:@acme/mcps/context" },
    }),
  );

  it.effect(
    "prepares an MCP server enable without inspecting the pre-change outcomes",
    () => {
      const created = world();
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          installContext.pipe(
            Effect.tap((resolution) =>
              Effect.sync(() => expect(deriveOperationOutcome(resolution)).toBe("applied")),
            ),
            Effect.andThen(
              applyActivationAcceptingExecutionChanges({
                type: "mcp-server",
                name: "context",
                enabled: false,
              }),
            ),
          ),
          EnableExtension.prepare({ type: "mcp-server", name: "context" }),
        );
        // The withdrawn native entry is stale, so the server still materializes.
        expect(stepsOf(counted.result)).toEqual([
          { key: "mcp-server:context", readiness: "ready" },
        ]);
        // Repeated: one detailed inventory, inspecting the disabled server's
        // native configuration, and 9 reads of `.mcp.json`. Currency and the
        // projected outcomes keep theirs.
        expect(counted).toMatchObject({ detailedMcpInventories: 0, mcpConfigReads: 7 });
      });
    },
    { timeout: 60_000 },
  );

  it.effect(
    "prepares a Pack enable without inspecting its already active member's outcomes",
    () => {
      const created = world();
      created.registry.writePack("toolkit", [
        { version: "1.0.0", dependencies: { "@acme/mcps/context": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          Effect.gen(function* () {
            expect(deriveOperationOutcome(yield* installContext)).toBe("applied");
            const pack = yield* applyInstallAcceptingExecutionChanges(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "test:@acme/packs/toolkit" },
              }),
            );
            expect(deriveOperationOutcome(pack)).toBe("applied");
            yield* applyActivationAcceptingExecutionChanges({
              type: "pack",
              name: "toolkit",
              enabled: false,
            });
          }),
          EnableExtension.prepare({ type: "pack", name: "toolkit" }),
        );
        // The member's native entry is current, so nothing materializes.
        expect(stepsOf(counted.result)).toEqual([]);
        // Repeated: one detailed inventory, inspecting every active MCP server,
        // and 6 reads of `.mcp.json`. The member's currency keeps its reads.
        expect(counted).toMatchObject({ detailedMcpInventories: 0, mcpConfigReads: 4 });
      });
    },
    { timeout: 60_000 },
  );
});
