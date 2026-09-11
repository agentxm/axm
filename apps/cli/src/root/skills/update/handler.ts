/**
 * `axm skills update` — the application boundary.
 *
 * Parses what the route registered, hands it to the update feature, and
 * renders what the feature settled on: a no-op envelope with the suggestions
 * that fit the reason it settled, or one operation outcome.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { SelectiveUpdate, UPDATE_NAME_FILTER_FLAG } from "@agentxm/extension-lifecycle";
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
import { withOperationLifecycle } from "../../../operation-lifecycle.js";
import { LIST_INSTALLED_SKILLS } from "../../suggested-actions.js";

const COMMAND = "skills.update";

export interface UpdateHandlerArgs {
  readonly source: Option.Option<string>;
  readonly skills: readonly string[];
  readonly force: boolean;
  readonly preview: boolean;
}

/** What each settled no-op offers a person next. */
const NO_OP_SUGGESTIONS = {
  "none-installed": [LIST_INSTALLED_SKILLS],
  "no-source-match": [LIST_INSTALLED_SKILLS],
  "no-name-match": [
    LIST_INSTALLED_SKILLS,
    { description: "Relax the `--name` filter and try again" },
  ],
} as const;

export const handleUpdate = (args: UpdateHandlerArgs) =>
  withOperationLifecycle(
    {
      command: COMMAND,
      mode: args.preview ? "preview" : "apply",
      planName: "Update skills",
      presentation: operationPresentation(
        { imperative: "update", past: "Updated", gerund: "Updating" },
        "skill",
      ),
    },
    handleUpdateBody(args).pipe(
      Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
        Effect.fail(extensionLifecycleFailedToAppError(failure)),
      ),
    ),
  );

const handleUpdateBody = Effect.fn("Update.handle")(function* (args: UpdateHandlerArgs) {
  const candidate = yield* SelectiveUpdate.prepare({
    kind: "selective-skills",
    source: args.source,
    nameFilters: args.skills,
    nameFilterFlag: UPDATE_NAME_FILTER_FLAG,
    ignoreVersionConstraints: args.force,
  });

  if (candidate.outcome === "nothing") {
    yield* emitNoOpOutcome(COMMAND, {
      planName: candidate.planName,
      planDescription: candidate.planDescription,
      message: candidate.message,
      suggestions: NO_OP_SUGGESTIONS[candidate.reason],
    });
    return;
  }

  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["skills", "update"],
      [
        recoverySwitch("--ignore-version-constraints", args.force),
        ...args.skills.map((skill) => recoveryOption("--name", publicRecoveryValue(skill))),
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
    suggestions: [LIST_INSTALLED_SKILLS],
  });
});
