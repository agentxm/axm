/**
 * The command shell every `axm install` route shares.
 *
 * The feature settles the install and resolves it; this module does what a
 * transport does — turn flags into an execution intent, turn typed refusals
 * into the error envelope, print the resolution evidence a `--verbose` run
 * asks for, and render the outcome with the next step a person takes.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  InstallExtensions,
  type InstallExtensionsCandidate,
  type InstallExtensionsRequest,
} from "@agentxm/extension-lifecycle";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  deriveOperationOutcome,
  operationPresentation,
  type ConfirmationRecoveryArgument,
} from "@agentxm/workspace-operations";

import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "../../cli-runtime/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { lifecycleFailureToAppError } from "../../feature-errors.js";
import { emitOperationResolution, operationResolutionSummary } from "../../operation-output.js";
import { Screen, headlineDoc } from "../../screen/index.js";
import { makeInstallPlanExecution } from "./confirmation-recovery.js";
import { emitNoOpOutcome } from "./no-op-output.js";
import { withOperationLifecycle } from "./operation-lifecycle.js";

export interface InstallCommandArgs {
  /** Telemetry and machine-output command identity, e.g. `skills.install`. */
  readonly command: string;
  readonly request: InstallExtensionsRequest;
  readonly preview: boolean;
  readonly force: boolean;
  /** The command words a confirmation-recovery line reproduces. */
  readonly recoveryCommand: ReadonlyArray<string>;
  /** The positional locators that line reproduces. */
  readonly recoveryLocators: ReadonlyArray<string>;
  /** Extra flags that line reproduces, such as `--all` or `--ignore-release-age`. */
  readonly recoveryArguments?: ReadonlyArray<ConfirmationRecoveryArgument>;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  /**
   * What to say when the request matched nothing to install. A route that
   * leaves this out reports the empty operation itself instead.
   */
  readonly noOpMessage?: string;
}

/** Print the resolution evidence and compatible packages a settling collected. */
const showDiagnostics = (candidate: InstallExtensionsCandidate) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    if (candidate.diagnostics.companionPackages.length > 0) {
      yield* screen.note(headlineDoc("info", "Compatible packages:"));
      for (const item of candidate.diagnostics.companionPackages) {
        yield* screen.note(headlineDoc("info", `  ${item}`));
      }
    }
    const verbosity = yield* Effect.serviceOption(Verbosity);
    const verbose = Option.match(verbosity, {
      onNone: () => false,
      onSome: (value) => value.isAtLeast("verbose"),
    });
    if (!verbose) return;
    for (const line of candidate.diagnostics.resolutionLines) {
      yield* screen.note(headlineDoc("info", line));
    }
  });

const body = (args: InstallCommandArgs) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.prepare(args.request).pipe(
      Effect.mapError(lifecycleFailureToAppError),
    );
    yield* showDiagnostics(candidate);

    const noOpMessage = args.noOpMessage;
    if (candidate.empty) {
      yield* emitNoOpOutcome(args.command, {
        planName: candidate.planName,
        message: Option.getOrElse(
          candidate.emptyMessage,
          () => noOpMessage ?? "No extensions installed.",
        ),
      });
      return;
    }

    const execution = yield* makeInstallPlanExecution(
      { preview: args.preview, force: args.force },
      args.recoveryCommand,
      args.recoveryLocators,
      args.recoveryArguments ?? [],
    );
    const resolution = yield* InstallExtensions.previewOrApply(candidate, execution).pipe(
      Effect.mapError(lifecycleFailureToAppError),
    );

    // A locator install can settle several types at once; only a single-type
    // outcome names its subject.
    const subjectType: SubjectType =
      candidate.types.length === 1 ? (candidate.types[0] ?? "mixed") : "mixed";
    yield* setCommandSemanticProperties(
      summarizeCommandOutcome(
        operationResolutionSummary(resolution, {
          subjectType,
          sourceKind: args.request.subject.kind === "source" ? "registry" : "workspace",
        }),
      ),
    );

    if (
      noOpMessage !== undefined &&
      deriveOperationOutcome(resolution) === "no-op" &&
      resolution.units.length === 0
    ) {
      yield* emitNoOpOutcome(args.command, { planName: resolution.name, message: noOpMessage });
      return;
    }

    yield* emitOperationResolution(args.command, resolution, { suggestions: args.suggestions });
  });

/** Run one install route end to end. */
export const runInstallCommand = (args: InstallCommandArgs) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.preview ? "preview" : "apply",
      planName: args.request.planName,
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        Option.getOrUndefined(args.request.type),
      ),
    },
    body(args),
  );
