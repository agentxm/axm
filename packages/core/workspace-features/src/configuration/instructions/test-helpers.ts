/**
 * Driving the instruction-management use case from this package's own tests
 * and specifications: settle a request, then apply or preview the candidate
 * it produced. A request the workspace already satisfies settles as
 * `Unchanged` and is returned as it is.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";

import {
  ManageInstructions,
  type InstructionsUnchanged,
  type ManageInstructionsCandidate,
  type ManageInstructionsRequest,
} from "./manage-instructions.js";

const run = (request: ManageInstructionsRequest, mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* ManageInstructions.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* ManageInstructions.previewOrApply(
      candidate,
      mode === "apply" ? preapprovedPlanExecution : previewPlanExecution,
    );
    return { candidate, resolution, outcome: deriveOperationOutcome(resolution) };
  });

export const applyInstructionsRequest = (request: ManageInstructionsRequest) =>
  run(request, "apply");

export const previewInstructionsRequest = (request: ManageInstructionsRequest) =>
  run(request, "preview");

export type InstructionsRunOutcome =
  | InstructionsUnchanged
  | {
      readonly candidate: ManageInstructionsCandidate;
      readonly resolution: Effect.Success<ReturnType<typeof ManageInstructions.previewOrApply>>;
      readonly outcome: ReturnType<typeof deriveOperationOutcome>;
    };

/** A platform whose symlink creation is refused, so aliases fall back to copies. */
export const makeSymlinkRefusingPlatform = () => {
  const rejectedSymlinkTargets: Array<string> = [];
  const layer = Layer.provide(
    Layer.effect(
      FileSystem.FileSystem,
      Effect.map(FileSystem.FileSystem, (filesystem) => ({
        ...filesystem,
        symlink: (_fromPath: string, toPath: string) =>
          Effect.gen(function* () {
            rejectedSymlinkTargets.push(toPath);
            return yield* PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "symlink",
              pathOrDescriptor: toPath,
              description: "This fixture exercises instruction-copy fallback.",
            });
          }),
      })),
    ),
    NodeServices.layer,
  );
  return {
    rejectedSymlinkTargets,
    layer: Layer.provideMerge(layer, NodeServices.layer),
  };
};
