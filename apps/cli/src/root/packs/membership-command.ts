/**
 * The command shell `axm packs add` and `axm packs remove` share.
 *
 * The feature settles which members change and resolves the manifest edit;
 * this module supplies the execution intent, the recovery command a
 * confirmation reprints, and the outcome rendering.
 */

import * as Effect from "effect/Effect";

import {
  ChangePackMembership,
  PackSelectorAmbiguous,
  packMembershipPlanName,
  type PackMembershipRequest,
} from "@agentxm/extension-authoring";
import { publicRecoveryValue, recoveryPositional } from "@agentxm/workspace-operations";

import { makeAppError } from "../../app-error/index.js";
import { toAppError } from "../../app-error/conversions.js";
import { emitOperationResolution } from "../../operation-output.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";

export interface PackMembershipCommandArgs {
  readonly request: PackMembershipRequest;
  readonly preview: boolean;
}

const commandId = (change: PackMembershipRequest["change"]) =>
  change === "add" ? "packs.add" : "packs.remove";

/**
 * The feature names the packs an ambiguous selector matched; only the
 * transport knows the rest of the invocation, so it is what turns each name
 * into a command the person can run.
 */
const membershipFailureToAppError =
  (request: PackMembershipRequest) =>
  (failure: PackSelectorAmbiguous | Parameters<typeof toAppError>[0]) =>
    failure instanceof PackSelectorAmbiguous
      ? makeAppError({
          code: "conflict",
          detail: `Pack selector '${failure.selector}' matches multiple configured packs`,
          suggestions: failure.configuredNames.map((name) => ({
            description: `Use configured pack name ${name}`,
            cmd: `axm packs ${request.change} ${name} ${request.selector}`,
          })),
        })
      : toAppError(failure);

const body = (args: PackMembershipCommandArgs) =>
  Effect.gen(function* () {
    const { change, pack, selector } = args.request;
    const candidate = yield* ChangePackMembership.prepare(args.request).pipe(
      Effect.mapError(membershipFailureToAppError(args.request)),
    );

    if (candidate._tag === "NoChange") {
      yield* emitNoOpOutcome(commandId(change), {
        planName: packMembershipPlanName(change),
        planDescription:
          change === "add"
            ? `Add extensions to ${candidate.pack}`
            : `Remove extensions from ${candidate.pack}`,
        message:
          change === "add" ? "No extensions added to pack." : "No extensions removed from pack.",
      });
      return;
    }

    const execution = yield* makePlanExecution(
      { preview: args.preview },
      makeConfirmationRecovery(
        ["packs", change],
        [
          recoveryPositional(publicRecoveryValue(pack)),
          recoveryPositional(publicRecoveryValue(selector)),
        ],
      ),
    );
    const resolution = yield* ChangePackMembership.previewOrApply(candidate, execution).pipe(
      Effect.mapError(toAppError),
    );
    yield* emitOperationResolution(commandId(change), resolution, {
      suggestions:
        change === "add"
          ? [
              { description: "Inspect installed packs", cmd: "axm packs list" },
              {
                description: "Remove from pack",
                cmd: `axm packs remove ${candidate.pack} ${selector}`,
              },
            ]
          : [
              { description: "Inspect installed packs", cmd: "axm packs list" },
              {
                description: "Add to pack",
                cmd: `axm packs add ${candidate.pack} <extension>`,
              },
            ],
    });
  });

/** Run one `packs add` or `packs remove` route end to end. */
export const runPackMembershipCommand = (args: PackMembershipCommandArgs) =>
  withOperationLifecycle(
    {
      command: commandId(args.request.change),
      mode: args.preview ? "preview" : "apply",
      planName: packMembershipPlanName(args.request.change),
    },
    body(args),
  );
