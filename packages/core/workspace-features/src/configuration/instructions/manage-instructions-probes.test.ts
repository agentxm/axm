/**
 * Enabling instruction management with a changed source file name removes the
 * superseded configuration's aliases under the transition lock. The removal
 * observes that configuration afresh, but reuses the symlink capability the
 * in-lock preflight just probed instead of probing again.
 *
 * Counts are exact for this fixture and cover only the applied transition,
 * after planning.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";

import { makeConfigurationFixture } from "../testing.js";
import { ManageInstructions } from "./manage-instructions.js";
import { applyInstructionsRequest } from "./test-helpers.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const SYMLINK_PROBE = ".axm-instructions-symlink-probe-";

describe("Removing a superseded instruction configuration reuses the in-lock preflight's symlink probe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "removes the superseded configuration's aliases with the preflight's probe",
    () => {
      const world = makeConfigurationFixture({
        settings: { agents: ["claude-code"] },
        files: {
          "OLD.md": "Original authored instructions.\n",
          "TEAM.md": "Selected team instructions.\n",
        },
      });
      cleanups.push(world.cleanup);
      return world
        .provide(
          Effect.gen(function* () {
            const recording = yield* FileSystemRecorder;
            yield* applyInstructionsRequest({
              action: "enable",
              fileName: "OLD.md",
              gitignoreAliases: false,
            });
            const alias = nodePath.join(world.root, "CLAUDE.md");
            expect(fs.readlinkSync(alias)).toBe("OLD.md");
            const candidate = yield* ManageInstructions.prepare({
              action: "enable",
              fileName: "TEAM.md",
              gitignoreAliases: false,
            });
            if (candidate._tag === "Unchanged") throw new Error("Expected a planned enable");
            recording.reset();
            yield* ManageInstructions.previewOrApply(candidate, preapprovedPlanExecution);
            expect(fs.readlinkSync(alias)).toBe("TEAM.md");
            expect({
              // Every probe of the applied transition runs under the lock: the
              // preflight's, and one by an observation inside the transition
              // that does not concern the superseded configuration.
              probes: recording
                .calls({ method: "makeTempDirectory" })
                .filter(({ path }) => path.includes(SYMLINK_PROBE)).length,
              // Both in-lock observations of the superseded configuration, the
              // preflight and the removal's own fresh one, read its source once
              // each; the removal's checks read it five more times (prepare, the
              // whole-snapshot witnesses of the source and its link, and the
              // target's source and link witnesses).
              supersededSourceReads: recording.contentReads(nodePath.join(world.root, "OLD.md")),
            }).toEqual({ probes: 2, supersededSourceReads: 7 });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );
});
