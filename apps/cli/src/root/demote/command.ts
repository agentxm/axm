import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/unstable/cli";

import { DemoteToExternalSource } from "@agentxm/extension-lifecycle";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryPositional,
} from "@agentxm/workspace-operations";

import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { emitOperationResolution } from "../../operation-output.js";
import { extensionLifecycleFailedToAppError } from "../../feature-errors.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import {
  preapprovalCapabilityFlag,
  previewCapabilityFlag,
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";

/**
 * Demote replaces workspace source authority, a confirmable condition a
 * person can approve in advance because the command names exactly what the
 * approval covers. Preview assesses the same plan without consuming it.
 */
const demoteCapabilities = {
  preview: true,
  preapproval: {
    purpose:
      "Approve replacing workspace source authority with the externally sourced package in advance",
  },
  trust: [],
  inputs: "explicit",
  effect: "workspace",
} as const satisfies CommandCapabilities;

export interface DemoteHandlerArgs {
  readonly fqn: string;
  readonly source: string;
  readonly yes: boolean;
  readonly preview: boolean;
}

export const handleDemote = (args: DemoteHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "demote",
      mode: args.preview ? "preview" : "apply",
      planName: "Demote workspace extension",
    },
    handleDemoteBody(args).pipe(
      Effect.catchTag("ExtensionLifecycleFailed", (failure) =>
        Effect.fail(extensionLifecycleFailedToAppError(failure)),
      ),
    ),
  );

const handleDemoteBody = Effect.fn("Demote.handle")(function* (args: DemoteHandlerArgs) {
  const candidate = yield* DemoteToExternalSource.prepare({
    fqn: args.fqn,
    source: args.source,
  });
  const execution = yield* makePlanExecution(
    { preview: args.preview, yes: args.yes },
    makeConfirmationRecovery(
      ["demote"],
      [
        recoveryPositional(publicRecoveryValue(args.fqn)),
        recoveryPositional(credentialFreeLocatorRecoveryValue(args.source)),
      ],
    ),
  );
  const resolution = yield* DemoteToExternalSource.previewOrApply(candidate, execution);
  yield* emitOperationResolution("demote", resolution);
});

const config = {
  fqn: Argument.string("extension").pipe(
    Argument.withDescription("Workspace extension FQN (@owner/<plural-type>/name)"),
  ),
  source: Argument.string("source").pipe(
    Argument.withDescription("Replacement registry, git, or local source"),
  ),
  yes: preapprovalCapabilityFlag(demoteCapabilities),
  preview: previewCapabilityFlag(),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const demoteCommand = Command.make(
  "demote",
  config,
  ({ fqn, source, yes, preview, ignoreReleaseAge }) =>
    handleDemote({ fqn, source, yes, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace("project"),
      withRuntime("demote"),
    ),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(demoteCapabilities),
  Command.withDescription("Explicitly remove project-workspace source authority"),
  Command.withExamples([
    {
      command: "axm demote @acme/skills/code-review @acme/skills/code-review",
      description: "Return a workspace skill to registry management",
    },
  ]),
);
