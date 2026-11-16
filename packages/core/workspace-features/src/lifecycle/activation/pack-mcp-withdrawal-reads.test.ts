/**
 * Work evidence for preparing a Pack disable that withdraws several MCP
 * connections: their dry-run withdrawals share one resolution of the
 * configured targets and one first read and co-reader check of each native
 * file, while each connection still renders, rechecks and reads back live.
 * Counts are exact for these fixtures over a real temporary workspace and a
 * `file://` Registry, beneath the production read views.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";

import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import { DisableExtension } from "./set-activation.js";

const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

describe("Pack disable preparation withdraws its MCP members from shared targets", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A Registry Pack of the named MCP connections and skills, installed and enabled. */
  const preparedDisable = (members: ReadonlyArray<string>, skills: ReadonlyArray<string> = []) => {
    const created: InstallWorld = makeInstallWorld();
    cleanups.push(created.cleanup);
    for (const name of members) created.registry.writeMcp(name, [{ version: "1.0.0" }]);
    for (const name of skills)
      created.registry.writeSkill(name, [{ version: "1.0.0", body: "Review." }]);
    created.registry.writePack("toolkit", [
      {
        version: "1.0.0",
        dependencies: Object.fromEntries([
          ...members.map((name) => [`@acme/mcps/${name}`, "^1.0.0"]),
          ...skills.map((name) => [`@acme/skills/${name}`, "^1.0.0"]),
        ]),
      },
    ]);
    return Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      const pack = yield* applyInstallAcceptingExecutionChanges(
        installRequest({
          type: "pack",
          subject: { kind: "source", source: "test:@acme/packs/toolkit" },
        }),
      );
      expect(deriveOperationOutcome(pack)).toBe("applied");
      recording.reset();
      const work = workObservations(false);
      const result = yield* DisableExtension.prepare({ type: "pack", name: "toolkit" }).pipe(
        work.provide,
      );
      const file = nodePath.join(created.workspace.root, ".mcp.json");
      return {
        result,
        mcpConfigReads: recording.contentReads(file),
        mcpConfigRealPaths: recording.counts(file).realPath ?? 0,
        nativeParses: work.facts.filter((fact) => fact.kind === "axm.parse.native").length,
      };
    }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
  };

  it.effect(
    "shares one target preparation across a Pack's MCP members",
    () =>
      Effect.gen(function* () {
        const one = yield* preparedDisable(["context"]);
        const two = yield* preparedDisable(["context", "lint"]);
        expect(one.result._tag).toBe("SetActivation");
        expect(two.result._tag).toBe("SetActivation");
        if (one.result._tag !== "SetActivation" || two.result._tag !== "SetActivation")
          throw new Error("Expected a change");
        expect(
          two.result.artifact.nativeLocations?.map((location) => ({
            keys: location.address.kind === "key-path" ? location.address.keys : [],
            state: location.state,
          })),
        ).toEqual([
          { keys: ["mcpServers", "context"], state: "removed" },
          { keys: ["mcpServers", "lint"], state: "removed" },
        ]);
        // A lone member's withdrawal reads as before. Each further member skips
        // the shared target resolution, its competing-entry read and the first
        // co-reader check: before this sharing, the two members took 13 reads,
        // 18 parses and 50 real-path resolutions of `.mcp.json`.
        expect({
          one: {
            reads: one.mcpConfigReads,
            parses: one.nativeParses,
            realPaths: one.mcpConfigRealPaths,
          },
          two: {
            reads: two.mcpConfigReads,
            parses: two.nativeParses,
            realPaths: two.mcpConfigRealPaths,
          },
        }).toEqual({
          one: { reads: 7, parses: 9, realPaths: 25 },
          two: { reads: 11, parses: 16, realPaths: 46 },
        });
      }),
    { timeout: 120_000 },
  );

  it.effect(
    "prepares a Pack disable without MCP members without observing MCP targets",
    () =>
      Effect.gen(function* () {
        const none = yield* preparedDisable([], ["review"]);
        expect(none.result._tag).toBe("SetActivation");
        expect({
          reads: none.mcpConfigReads,
          parses: none.nativeParses,
          realPaths: none.mcpConfigRealPaths,
        }).toEqual({ reads: 0, parses: 0, realPaths: 0 });
      }),
    { timeout: 120_000 },
  );
});
