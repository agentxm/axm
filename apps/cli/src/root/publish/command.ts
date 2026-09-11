import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { AppError, exitCodeFor } from "../../app-error/index.js";
import {
  acceptWarningsFlag,
  isNonInteractive,
  jsonFlag,
  waitForHumanOption,
} from "../../cli-flags/index.js";
import {
  effectCliExit,
  recordCommandCompletion,
  withArgvTracking,
} from "../../cli-runtime/index.js";
import { withLiveOperation } from "../../operation-lifecycle.js";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
} from "@agentxm/workspace-operations";
import {
  PublishExtensions,
  normalizePublishResult,
  selectableTypes,
  type OnExistingPolicy,
  type PublishOutcome,
  type PublishRequest,
} from "@agentxm/extension-publish";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions";
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
  readonly authorizationRequest?: string;
  readonly waitForHumanSeconds?: number;
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
  ...(args.authorizationRequest === undefined
    ? {}
    : { authorizationRequest: args.authorizationRequest }),
  ...(args.waitForHumanSeconds === undefined
    ? {}
    : { waitForHumanSeconds: args.waitForHumanSeconds }),
  unattended,
});

/** Render the feature's outcome, then terminate the way it says to. */
const reportPublishOutcome = Effect.fn("Publish.report")(function* (
  args: RootPublishHandlerArgs,
  outcome: PublishOutcome,
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
  const emitted = yield* emitPublishResult(
    "publish",
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
    outcome.suggestions.length === 0 ? undefined : { suggestions: outcome.suggestions },
  );
  if (outcome.disposition._tag === "Interrupted") {
    const exitCode = outcome.disposition.signal === "SIGTERM" ? 143 : 130;
    yield* recordCommandCompletion(exitCode);
    return yield* Effect.die(effectCliExit(exitCode));
  }
  if (outcome.disposition._tag === "Failed") {
    const failure = publishFailureToAppError(outcome.disposition.failure);
    return emitted ? yield* Effect.die(effectCliExit(exitCodeFor(failure.code))) : yield* failure;
  }
});

export const handleRootPublish = Effect.fn("Publish.handle")(
  function* (args: RootPublishHandlerArgs) {
    const unattended = (yield* isNonInteractive) || Option.getOrElse(yield* jsonFlag, () => false);
    yield* withLiveOperation(
      { command: "publish", name: "Publish extensions", mode: args.preview ? "preview" : "apply" },
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
            return yield* reportPublishOutcome(args, preparation.outcome);
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
          const outcome = yield* PublishExtensions.previewOrApply(preparation.candidate, execution);
          return yield* reportPublishOutcome(args, outcome);
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
  authorizationRequest: Flag.string("authorization-request").pipe(
    Flag.withDescription(
      "Resume this exact publication request using its URL and unchanged inputs",
    ),
    Flag.optional,
  ),
  waitForHuman: waitForHumanOption,
  selectors: Argument.string("extension").pipe(
    Argument.withDescription("FQNs or type-qualified extension selectors"),
    Argument.atLeast(0),
  ),
  owner: Flag.string("owner").pipe(Flag.withDescription("Filter by owner"), Flag.atLeast(0)),
  type: Flag.choice("type", selectableTypes).pipe(
    Flag.withDescription("Filter by extension type"),
    Flag.atLeast(0),
  ),
  exclude: Flag.string("exclude").pipe(
    Flag.withDescription("Exclude a matching selector"),
    Flag.atLeast(0),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry"),
    Flag.optional,
  ),
  registryUrl: Flag.string("registry-url").pipe(
    Flag.withDescription("Override the target registry URL for automation"),
    Flag.optional,
  ),
  onExisting: onExistingFlag,
  backfill: backfillFlag,
  acceptWarnings: acceptWarningsFlag,
  visibility: Flag.choice("visibility", ["public", "private"] as const).pipe(
    Flag.withDescription("Initial visibility for every new extension in the selection"),
    Flag.optional,
  ),
  preview: previewCapabilityFlag("Preflight without uploading"),
  includeDependencies: Flag.boolean("include-dependencies").pipe(
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
    ...(Option.isNone(parsed.authorizationRequest)
      ? {}
      : { authorizationRequest: parsed.authorizationRequest.value }),
    ...(Option.isNone(parsed.waitForHuman)
      ? {}
      : { waitForHumanSeconds: parsed.waitForHuman.value }),
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
