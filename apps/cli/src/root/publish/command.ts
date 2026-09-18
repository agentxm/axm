import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { AppError, exitCodeFor } from "../../app-error/index.js";
import { acceptWarningsFlag, isNonInteractive, jsonFlag } from "../../cli-flags/index.js";
import {
  effectCliExit,
  recordCommandCompletion,
  withArgvTracking,
} from "../../cli-runtime/index.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import {
  ResolvePlanInteraction,
  type ResolvePlanInteractionService,
} from "@agentxm/workspace/transitions/planning";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
} from "@agentxm/workspace/transitions/planning";
import {
  PublishExtensions,
  normalizePublishResult,
  selectableTypes,
  type OnExistingPolicy,
  type PublishOutcome,
  type PublishRequest,
} from "@agentxm/workspace/publishing";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { publishFailureToAppError } from "../../feature-errors.js";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import { emitPublishResult } from "./result.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { backfillFlag, onExistingFlag } from "../shared/publish-flags.js";

/** The CLI-supplied inputs a publish invocation carries beyond the request. */
export interface RootPublishHandlerArgs {
  readonly selectors: ReadonlyArray<string>;
  readonly owners: ReadonlyArray<string>;
  readonly types: ReadonlyArray<(typeof selectableTypes)[number]>;
  readonly excludes: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly registryUrl: Option.Option<string>;
  readonly onExisting: Option.Option<OnExistingPolicy>;
  readonly backfill: boolean;
  readonly acceptWarnings: boolean;
  readonly preview: boolean;
  readonly scope: WorkspaceScope;
  readonly visibility: Option.Option<ExtensionVisibility>;
  readonly includeDependencies: boolean;
  readonly recoveryCommand?: ReadonlyArray<string>;
  readonly recoverySelectors?: ReadonlyArray<string>;
  readonly recoveryExcludes?: ReadonlyArray<string>;
}

/**
 * The exact command that continues an unsettled publish. Recovery-command
 * rendering is an application concern: it spells this CLI's flags.
 */
export const makeExactPublishRecovery = (
  args: Pick<
    RootPublishHandlerArgs,
    "registry" | "registryUrl" | "backfill" | "visibility" | "acceptWarnings" | "recoveryCommand"
  >,
  candidateFqns: ReadonlyArray<string>,
) =>
  makeConfirmationRecovery(
    [...(args.recoveryCommand ?? ["publish"])],
    [
      ...Option.match(args.registry, {
        onNone: () => [],
        onSome: (registryName) => [recoveryOption("--registry", publicRecoveryValue(registryName))],
      }),
      ...Option.match(args.registryUrl, {
        onNone: () => [],
        onSome: (url) => [
          recoveryOption("--registry-url", credentialFreeLocatorRecoveryValue(url)),
        ],
      }),
      recoveryOption("--on-existing", publicRecoveryValue("verify")),
      recoverySwitch("--backfill", args.backfill),
      recoverySwitch("--accept-warnings", args.acceptWarnings),
      ...Option.match(args.visibility, {
        onNone: () => [],
        onSome: (visibility) => [recoveryOption("--visibility", publicRecoveryValue(visibility))],
      }),
      ...candidateFqns.map((fqn) => recoveryPositional(publicRecoveryValue(fqn))),
    ],
  );

const publishRequest = (args: RootPublishHandlerArgs, unattended: boolean): PublishRequest => ({
  selectors: args.selectors,
  owners: args.owners,
  types: args.types,
  excludes: args.excludes,
  registry: args.registry,
  registryUrl: args.registryUrl,
  onExisting: args.onExisting,
  backfill: args.backfill,
  acceptWarnings: args.acceptWarnings,
  preview: args.preview,
  scope: args.scope === "user" ? "user" : "project",
  visibility: args.visibility,
  includeDependencies: args.includeDependencies,
  unattended,
});

/** The exit code an outcome's disposition ends the invocation with. */
const dispositionExitCode = (disposition: PublishOutcome["disposition"]): number => {
  switch (disposition._tag) {
    case "Completed":
      return 0;
    case "Interrupted":
      return disposition.signal === "SIGTERM" ? 143 : 130;
    case "Failed":
      return exitCodeFor(publishFailureToAppError(disposition.failure).code);
  }
};

/**
 * What the reported outcome offers next: the feature's suggestions and the
 * recoveries its failure carries, once each. A reported failure ends with its
 * exit code rather than a problem report, so its recoveries travel here.
 */
const outcomeSuggestions = (outcome: PublishOutcome): ReadonlyArray<SuggestedAction> => {
  const suggestions = [
    ...outcome.suggestions,
    ...(outcome.disposition._tag === "Failed"
      ? (publishFailureToAppError(outcome.disposition.failure).suggestions ?? [])
      : []),
  ];
  return suggestions.filter(
    (suggestion, index) =>
      suggestions.findIndex(
        (other) =>
          other.description === suggestion.description &&
          other.cmd === suggestion.cmd &&
          other.url === suggestion.url,
      ) === index,
  );
};

/** Render the feature's outcome, then terminate the way it says to. */
const reportPublishOutcome = Effect.fn("Publish.report")(function* (
  args: RootPublishHandlerArgs,
  outcome: PublishOutcome,
  startedAtMs: number,
) {
  const recovery =
    outcome.recovery === undefined
      ? undefined
      : yield* Effect.gen(function* () {
          const execution = yield* makePlanExecution(
            { preview: args.preview },
            makeExactPublishRecovery(args, outcome.recovery?.remainingItems ?? []),
          );
          const cmd =
            "approvalRecovery" in execution
              ? renderConfirmationRecoveryCommand(execution.approvalRecovery, { approval: "none" })
              : undefined;
          return cmd === undefined
            ? undefined
            : {
                description: outcome.recovery?.description ?? "",
                cmd,
                remainingItems: outcome.recovery?.remainingItems ?? [],
                blockedDependents: outcome.recovery?.blockedDependents ?? [],
              };
        });
  const exitCode = dispositionExitCode(outcome.disposition);
  const reported = yield* emitPublishResult(
    normalizePublishResult({
      mode: outcome.mode,
      ...(outcome.preconditions === undefined ? {} : { preconditions: outcome.preconditions }),
      ...(outcome.riskConditions === undefined ? {} : { riskConditions: outcome.riskConditions }),
      selection: outcome.selection,
      publicationSet: outcome.publicationSet,
      results: outcome.results,
      ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
      ...(outcome.interruption === undefined ? {} : { interruption: outcome.interruption }),
      ...(recovery === undefined ? {} : { recovery }),
    }),
    {
      exitCode,
      elapsedMs: (yield* Clock.currentTimeMillis) - startedAtMs,
      suggestions: outcomeSuggestions(outcome),
    },
  );
  if (outcome.disposition._tag === "Interrupted") {
    yield* recordCommandCompletion(exitCode);
    return yield* Effect.die(effectCliExit(exitCode));
  }
  if (outcome.disposition._tag === "Failed") {
    // A reported outcome already carries the verdict and its recoveries, so
    // the invocation ends with its exit code rather than a second report.
    return reported
      ? yield* Effect.die(effectCliExit(exitCode))
      : yield* publishFailureToAppError(outcome.disposition.failure);
  }
});

/**
 * Publish's view renders its preview from the publication set, which carries
 * what the execution plan cannot — skipped extensions, visibility, and source
 * state — so the plan is not printed a second time as its own result. An apply
 * still hands its rows to the live ledger.
 */
const withPublishPreviewOwnedByView = Effect.updateService(
  ResolvePlanInteraction,
  (interaction): ResolvePlanInteractionService => ({
    ...interaction,
    presentPlan: (plan, options) =>
      options.mode === "preview" ? Effect.void : interaction.presentPlan(plan, options),
  }),
);

export const handleRootPublish = Effect.fn("Publish.handle")(
  function* (args: RootPublishHandlerArgs) {
    const startedAtMs = yield* Clock.currentTimeMillis;
    const unattended = (yield* isNonInteractive) || Option.getOrElse(yield* jsonFlag, () => false);
    yield* withLiveOperation(
      {
        command: "publish",
        name: "Publish extensions",
        mode: args.preview ? "preview" : "apply",
        productActivity: { activity: "publish", activationEligible: false },
      },
      // An external termination must reach the run and still leave a reported
      // outcome behind: the feature settles the interruption into a publish
      // outcome, so reporting it stays inside the mask while selection,
      // confirmation, and the plan itself remain interruptible.
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const preparation = yield* restore(
            PublishExtensions.prepare(publishRequest(args, unattended)),
          );
          if (preparation._tag === "Settled") {
            return yield* reportPublishOutcome(args, preparation.outcome, startedAtMs);
          }
          const execution = yield* restore(
            makePlanExecution(
              { preview: args.preview },
              makeExactPublishRecovery(args, preparation.candidate.candidateFqns),
              args.acceptWarnings ? ["accept-warnings"] : [],
            ),
          );
          // The feature settles an interruption into an outcome behind its own
          // interruptibility control, so this call is not restored: what it
          // returns must reach the report.
          const outcome = yield* PublishExtensions.previewOrApply(
            preparation.candidate,
            execution,
          ).pipe(withPublishPreviewOwnedByView);
          return yield* reportPublishOutcome(args, outcome, startedAtMs);
        }),
      ),
    );
  },
  Effect.mapError((failure) =>
    failure instanceof AppError ? failure : publishFailureToAppError(failure),
  ),
  Effect.asVoid,
);

const publishConfig = {
  selectors: Argument.String("extension").pipe(
    Argument.withDescription("FQNs or type-qualified extension selectors"),
    Argument.atLeast(0),
  ),
  owner: Flag.String("owner").pipe(Flag.withDescription("Filter by owner"), Flag.atLeast(0)),
  type: Flag.Literals("type", selectableTypes).pipe(
    Flag.withDescription("Filter by extension type"),
    Flag.atLeast(0),
  ),
  exclude: Flag.String("exclude").pipe(
    Flag.withDescription("Exclude a matching selector"),
    Flag.atLeast(0),
  ),
  registry: Flag.String("registry").pipe(
    Flag.withDescription("Target a specific named registry"),
    Flag.optional,
  ),
  registryUrl: Flag.String("registry-url").pipe(
    Flag.withDescription("Override the target registry URL for automation"),
    Flag.optional,
  ),
  onExisting: onExistingFlag,
  backfill: backfillFlag,
  acceptWarnings: acceptWarningsFlag,
  visibility: Flag.Literals("visibility", ["public", "private"] as const).pipe(
    Flag.withDescription("Initial visibility for every new extension in the selection"),
    Flag.optional,
  ),
  preview: previewCapabilityFlag("Preflight without uploading"),
  includeDependencies: Flag.Boolean("include-dependencies").pipe(
    Flag.withDescription("Include workspace-sourced dependencies of selected packs"),
    Flag.withDefault(false),
  ),
} as const;

export const publishCommand = Command.make("publish", publishConfig, (parsed) =>
  handleRootPublish({
    selectors: [...parsed.selectors],
    owners: [...parsed.owner],
    types: [...parsed.type],
    excludes: [...parsed.exclude],
    registry: parsed.registry,
    registryUrl: parsed.registryUrl,
    onExisting: parsed.onExisting,
    backfill: parsed.backfill,
    acceptWarnings: parsed.acceptWarnings,
    preview: parsed.preview,
    scope: "project",
    visibility: parsed.visibility,
    includeDependencies: parsed.includeDependencies,
  }).pipe(withWorkspace("project"), withRuntime("publish")),
).pipe(
  withArgvTracking(publishConfig),
  withCommandCapabilities(
    previewableCapabilities("registry", { inputs: "explicit-or-documented-defaults" }),
  ),
  Command.withDescription(
    "Publish project-workspace extensions to a registry (archive policy: axm help publish)",
  ),
  Command.withExamples([
    { command: "axm publish", description: "Publish every workspace-sourced extension" },
    {
      command: "axm publish --owner @acme --on-existing verify",
      description: "Idempotently publish an authored catalog",
    },
    {
      command: "axm publish @acme/skills/code-review",
      description: "Publish one workspace-authored extension explicitly",
    },
  ]),
);
