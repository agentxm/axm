/**
 * Shared fixtures for the plan-family specifications and tests in this area.
 *
 * Every rule here is decided over a real temporary workspace and the
 * production transaction scope, so the durable effects the rules are about are
 * observable. Production source never imports this module.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import {
  FootprintRecorder,
  WorkspaceTransactionScope,
  makeFootprintRecorder,
} from "@agentxm/workspace-transactions";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import {
  ConfiguredAgentOutcomesProviderTest,
  makeBaseWorkspaceMock,
} from "@agentxm/workspace-state/testing";

import type { PlanInteractionFailed } from "../errors.js";
import { OperationJournal, makeOperationJournal } from "../operation-journal.js";
import type { ConfirmationRecovery } from "../plan-execution.js";
import { ResolvePlanInteractionTest, type ApplyConfirmation } from "../resolve-plan-interaction.js";

/** A workspace directory whose authoritative files exist on disk. */
export const makeSpecWorkspace = (prefix: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix });
    const workspaceDir = path.join(root, ".axm");
    yield* fs.makeDirectory(workspaceDir, { recursive: true });
    const settingsPath = path.join(root, "axm.json");
    const lockPath = path.join(root, "axm-lock.yaml");
    yield* fs.writeFileString(settingsPath, '{\n  "skills": {}\n}\n');
    yield* fs.writeFileString(lockPath, "lockfileVersion: 7\nskills: {}\n");
    return { root, workspaceDir, settingsPath, lockPath };
  });

/** The plan pipeline's requirements over one workspace, with a recording port. */
export const makeSpecContext = (
  workspaceDir: string,
  options?: {
    readonly confirmApplyChanges?: (
      recovery: ConfirmationRecovery,
    ) => Effect.Effect<ApplyConfirmation, PlanInteractionFailed>;
    readonly confirmationAvailable?: boolean;
  },
) => {
  const interaction = ResolvePlanInteractionTest({
    ...(options?.confirmationAvailable === undefined
      ? {}
      : { isConfirmationAvailable: options.confirmationAvailable }),
    ...(options?.confirmApplyChanges === undefined
      ? {}
      : { confirmApplyChanges: options.confirmApplyChanges }),
  });
  return {
    interaction,
    layer: Layer.mergeAll(
      Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(workspaceDir)),
      interaction.layer,
      ConfiguredAgentOutcomesProviderTest,
      Layer.effect(OperationJournal, makeOperationJournal),
      Layer.effect(FootprintRecorder, makeFootprintRecorder),
      Layer.unwrap(
        Effect.map(Path.Path, (path) =>
          WorkspaceTransactionScope.layer({
            workspaceDir,
            settingsPath: path.join(path.dirname(workspaceDir), "axm.json"),
            lockPath: path.join(path.dirname(workspaceDir), "axm-lock.yaml"),
          }),
        ),
      ),
    ),
  };
};
