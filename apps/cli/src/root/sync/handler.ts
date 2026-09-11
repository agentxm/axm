/**
 * Handler for `axm sync`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  deriveOperationOutcome,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/workspace-operations";
import { SYNC_PRESENTATION, SyncWorkspace } from "@agentxm/workspace-sync";

import { makeAppError } from "../../app-error/index.js";
import { syncFailureToAppError } from "../../feature-errors.js";
import { emitOperationResolution } from "../../operation-output.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

export interface HandleSyncArgs {
  readonly target?: Option.Option<string>;
  readonly type?: Option.Option<Exclude<ExtensionType, "pack">>;
  readonly preview: boolean;
  readonly failOnChange?: boolean;
}

export const handleSync = (args: HandleSyncArgs) =>
  withOperationLifecycle(
    {
      command: "sync",
      mode: args.preview === true ? "preview" : "apply",
      planName: "Sync workspace",
      presentation: SYNC_PRESENTATION,
    },
    handleSyncBody(args),
  );

const handleSyncBody = Effect.fn("Sync.handle")(function* (args: HandleSyncArgs) {
  if (args.failOnChange === true && !args.preview) {
    return yield* makeAppError({
      code: "usage",
      detail: "--fail-on-change requires --preview",
      suggestions: [
        {
          description: "Run the read-only convergence assertion",
          cmd: "axm sync --preview --fail-on-change",
        },
      ],
    });
  }

  const target = args.target ?? Option.none<string>();
  const type = args.type ?? Option.none<Exclude<ExtensionType, "pack">>();
  const candidate = yield* SyncWorkspace.prepare({ target, type }).pipe(
    Effect.mapError(syncFailureToAppError),
  );

  if (candidate._tag === "AlreadyReconciled") {
    yield* emitNoOpOutcome("sync", {
      planName: candidate.planName,
      planDescription: candidate.planDescription,
      message: candidate.message,
    });
    return;
  }

  // Sync confirms nothing in advance: it applies ready reconciliation work and
  // stops before mutation if a plan ever carries an unexpected confirmable
  // condition, naming interactive approval rather than a flag it lacks.
  const execution = yield* makePlanExecution(
    { preview: args.preview },
    makeConfirmationRecovery(
      ["sync"],
      [
        ...Option.match(target, {
          onNone: () => [],
          onSome: (value) => [recoveryPositional(publicRecoveryValue(value))],
        }),
        ...Option.match(type, {
          onNone: () => [],
          onSome: (value) => [recoveryOption("--type", publicRecoveryValue(value))],
        }),
        recoverySwitch("--fail-on-change", args.failOnChange === true),
      ],
    ),
  );
  const resolution = yield* SyncWorkspace.previewOrApply(candidate, execution);
  const outcome = deriveOperationOutcome(resolution);
  const diverged =
    args.failOnChange === true && outcome === "previewed" && resolution.units.length > 0;
  yield* emitOperationResolution(
    "sync",
    diverged ? { ...resolution, divergence: true } : resolution,
    diverged
      ? { message: "Workspace reconciliation is required; no changes were applied" }
      : outcome === "no-op" && resolution.units.length === 0
        ? { message: candidate.upToDateMessage }
        : {},
  );
});
