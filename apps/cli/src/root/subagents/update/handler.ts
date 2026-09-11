/**
 * `axm subagents update` — the application boundary.
 *
 * Parses what the route registered, hands it to the update feature, and
 * renders what the feature settled on: a no-op envelope, or one operation
 * outcome.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { SelectiveUpdate } from "@agentxm/extension-lifecycle";
import {
  credentialFreeLocatorRecoveryValue,
  operationPresentation,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/workspace-operations";

import { extensionLifecycleFailedToAppError } from "../../../feature-errors.js";
import { emitOperationResolution } from "../../../operation-output.js";
import { makeConfirmationRecovery, makePlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { UPDATE_NAME_FILTER_FLAG } from "../../shared/update-targets.js";

const COMMAND = "subagents.update";

export interface UpdateHandlerArgs {
  readonly source: Option.Option<string>;
  readonly subagents: readonly string[];
  readonly force: boolean;
  readonly preview: boolean;
}

export const handleUpdate = (args: UpdateHandlerArgs) =>
  withOperationLifecycle(
    {
      command: COMMAND,
      mode: args.preview ? "preview" : "apply",
      planName: "Update subagents",
      presentation: operationPresentation(
        { imperative: "update", past: "Updated", gerund: "Updating" },
        "subagent",
      ),
    },
    handleUpdateBody(args).pipe(
      Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
        Effect.fail(extensionLifecycleFailedToAppError(failure)),
      ),
    ),
  );

const handleUpdateBody = Effect.fn("SubagentsUpdate.handle")(function* (args: UpdateHandlerArgs) {
  const candidate = yield* SelectiveUpdate.prepare({
    kind: "selective-subagents",
    source: args.source,
    nameFilters: args.subagents,
    nameFilterFlag: UPDATE_NAME_FILTER_FLAG,
    ignoreVersionConstraints: args.force,
  });

  if (candidate.outcome === "nothing") {
    yield* emitNoOpOutcome(COMMAND, {
      planName: candidate.planName,
      planDescription: candidate.planDescription,
      message: candidate.message,
    });
    return;
  }

  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["subagents", "update"],
      [
        recoverySwitch("--ignore-version-constraints", args.force),
        ...args.subagents.map((subagent) =>
          recoveryOption("--name", publicRecoveryValue(subagent)),
        ),
        ...Option.match(args.source, {
          onNone: () => [],
          onSome: (source) => [recoveryPositional(credentialFreeLocatorRecoveryValue(source))],
        }),
      ],
    ),
    args.force ? ["ignore-version-constraints"] : [],
  );
  const resolution = yield* SelectiveUpdate.previewOrApply(candidate, execution);
  yield* emitOperationResolution(COMMAND, resolution, {
    suggestions: [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
  });
});
