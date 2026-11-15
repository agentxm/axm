/**
 * Enabling instruction management observes the Rules region once while
 * planning: the rule manager's eager observation is the one the plan reports
 * its pending region update from.
 *
 * Counts are exact for this fixture. Each observation of the Rules region
 * reads `AGENTS.md` once.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { previewPlanExecution } from "@agentxm/workspace-kernel/operations";

import { makeConfigurationFixture } from "../testing.js";
import { ManageInstructions } from "./manage-instructions.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const INSTRUCTIONS = "AGENTS.md";

describe("Instruction management hands the rule manager's eager observation to its plan", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "observes the Rules region once while planning an enable",
    () => {
      const world = makeConfigurationFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          rules: { review: { source: "workspace" } },
        },
        files: {
          "rules/review/rule.json": JSON.stringify({
            type: "rule",
            name: "review",
            owner: "@acme",
            version: "1.0.0",
            title: "Review",
            description: "Review changes",
          }),
          "rules/review/src/RULE.md": "Record review risks.\n",
          [INSTRUCTIONS]: "# Authored instructions\n",
        },
      });
      cleanups.push(world.cleanup);
      return world
        .provide(
          Effect.gen(function* () {
            const recording = yield* FileSystemRecorder;
            recording.reset();
            const candidate = yield* ManageInstructions.prepare({
              action: "enable",
              fileName: INSTRUCTIONS,
              gitignoreAliases: false,
            });
            const planned = recording.contentReads(nodePath.join(world.root, INSTRUCTIONS));
            if (candidate._tag === "Unchanged") throw new Error("Expected a planned enable");
            const resolution = yield* ManageInstructions.previewOrApply(
              candidate,
              previewPlanExecution,
            );
            expect(resolution.units.flatMap((unit) => unit.artifact?.targets ?? [])).toContainEqual(
              { path: INSTRUCTIONS, change: "updated" },
            );
            // Observing the rule plans again read the instruction file 6 times.
            expect(planned).toBe(5);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );
});
