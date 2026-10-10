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
  type InstallExtensionsSelection,
} from "@agentxm/workspace-features/lifecycle";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { SettingsReader, WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  InstallSelectionCancelled,
  deriveOperationOutcome,
  operationPresentation,
  type ConfirmationRecoveryArgument,
} from "@agentxm/workspace-kernel/operations";

import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  type SubjectType,
} from "../../cli-runtime/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import {
  emitNoOpOutcome,
  emitOperationResolution,
  operationResolutionSummary,
  retryCanHelp,
} from "../../operation-output.js";
import { Screen, headlineDoc } from "../../screen/index.js";
import {
  makeInstallPlanInvocation,
  narrowInstallSelection,
  retrySuggestion,
} from "./confirmation-recovery.js";
import { recordSkillInstalls } from "../../cli-runtime/index.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { withWorkspace } from "../../runtime.js";
import type { ExpectedCliError } from "../../cli-runtime/index.js";
import { firstUseWorkspace, type FirstUse } from "./first-use.js";

export interface InstallCommandArgs<R = never> {
  /** Telemetry and machine-output command identity, e.g. `skills.install`. */
  readonly command: string;
  readonly request: InstallExtensionsRequest;
  readonly preview: boolean;
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
  /**
   * Present when the scope has no settings and establishing it asks something.
   * The command then selects in the uninitialized scope, establishes the
   * workspace, and plans and applies in it.
   */
  readonly firstInstall?: FirstInstall<R>;
}

/** The first use a first install defers until its selection is made. */
export interface FirstInstall<R = never> {
  readonly scope: WorkspaceScope;
  readonly establish: Effect.Effect<FirstUse, ExpectedCliError, R>;
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

/**
 * A person who backs out of choosing what to install has not failed: the
 * cancellation reaches the runtime as itself, which settles it as a clean
 * exit, and every other failure becomes the error envelope.
 */
const settlingFailure = (failure: unknown) =>
  failure instanceof InstallSelectionCancelled ? failure : failureToAppError(failure);

/** Plan a settled selection and carry it through to its reported outcome. */
const complete = <R>(args: InstallCommandArgs<R>, selection: InstallExtensionsSelection) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.plan(args.request, selection).pipe(
      Effect.mapError(failureToAppError),
    );
    yield* showDiagnostics(candidate);

    const noOpMessage = args.noOpMessage;
    const { execution, recovery } = yield* makeInstallPlanInvocation(
      { preview: args.preview },
      args.recoveryCommand,
      args.recoveryLocators,
      args.recoveryArguments ?? [],
    );
    const { resolution, installedSkills } = yield* InstallExtensions.previewOrApply(
      candidate,
      execution,
    ).pipe(Effect.mapError(failureToAppError));

    yield* recordSkillInstalls(installedSkills);

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
      yield* emitNoOpOutcome({ planName: resolution.name, message: noOpMessage });
      return;
    }

    // Rules and Knowledge reach agents through instruction files. A workspace
    // that never settled that choice was established unattended, so say what
    // settles it rather than leave the install looking finished. Setup has no
    // instruction choice to offer the user scope.
    const instructionChoiceOpen =
      !args.preview &&
      (yield* WorkspaceLocation).scope === "project" &&
      candidate.types.some((type) => type === "knowledge" || type === "rule") &&
      Option.isNone(
        yield* (yield* SettingsReader).instructionsConfig.pipe(Effect.mapError(failureToAppError)),
      );
    const suggestions: ReadonlyArray<SuggestedAction> = instructionChoiceOpen
      ? [
          {
            description:
              "Instruction files are not set up, so agents do not see installed Rules or Knowledge yet; set them up",
            cmd: "axm setup",
          },
          ...args.suggestions,
        ]
      : args.suggestions;

    yield* emitOperationResolution(resolution, {
      recovery,
      // An install that did not finish is repeated through the invocation the
      // person typed, narrowed to the extensions still waiting where the
      // source selection can name them; settled units converge as no-ops.
      suggestions: ({ unsettled }) =>
        unsettled.length === 0 || !retryCanHelp(unsettled)
          ? suggestions
          : [
              retrySuggestion(
                unsettled.length === 1
                  ? "Try the extension that did not install again"
                  : "Try the extensions that did not install again",
                args.request.subject.kind === "source"
                  ? narrowInstallSelection(recovery, unsettled)
                  : recovery,
              ),
              ...suggestions,
            ],
    });
  });

/**
 * Selection comes first, so what a first install asks to establish its
 * workspace follows what the person chose and a source that offers nothing
 * never asks it.
 */
const body = <R>(args: InstallCommandArgs<R>) =>
  Effect.gen(function* () {
    const selection = yield* InstallExtensions.select(args.request).pipe(
      Effect.mapError(settlingFailure),
    );
    const firstInstall = args.firstInstall;
    if (firstInstall === undefined) return yield* complete(args, selection);
    const firstUse = yield* firstInstall.establish;
    return yield* complete(args, selection).pipe(
      withWorkspace(firstUseWorkspace(firstInstall.scope, firstUse)),
    );
  });

/** Run one install route end to end. */
export const runInstallCommand = <R = never>(args: InstallCommandArgs<R>) =>
  withOperationLifecycle(
    {
      command: args.command,
      mode: args.preview ? "preview" : "apply",
      planName: args.request.planName,
      productActivity: { activity: "install", activationEligible: true },
      presentation: operationPresentation(
        { imperative: "install", past: "Installed", gerund: "Installing" },
        Option.getOrUndefined(args.request.type),
      ),
    },
    body(args),
  );
