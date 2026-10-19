/**
 * The command every `axm <type> new` route shares.
 *
 * The feature settles the creation and resolves it; this module does what a
 * transport does — turn typed refusals into the error envelope, turn command
 * flags into an execution intent, and render the outcome with the next step
 * an author takes.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/cli";

import {
  CreateExtension,
  createExtensionPlanName,
  type CreateExtensionCandidate,
  type CreatableExtensionType,
  type CreateExtensionRequest,
} from "@agentxm/workspace-features/authoring";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { failureToAppError } from "../../app-error/conversions.js";
import { emitOperationResolution } from "../../operation-output.js";
import { makePlanInvocation } from "./confirmation-recovery.js";
import { withOperationLifecycle } from "../../operation-lifecycle.js";
import { descriptionFlag } from "../../cli-flags/index.js";
import { creationOwnerFlag } from "../../cli-flags/owner-handle.js";
import { withParameterDescription } from "../../cli-parameters.js";
import { withArgvTracking, type ExpectedCliError } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { extensionTypePresentation } from "../extension-type-presentation.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "./command-capabilities.js";

export interface CreateExtensionCommandArgs {
  readonly request: CreateExtensionRequest;
  readonly preview: boolean;
  /** What the author does next, rendered from the settled creation. */
  readonly suggestions: (candidate: CreateExtensionCandidate) => ReadonlyArray<SuggestedAction>;
}

const body = (args: CreateExtensionCommandArgs) =>
  Effect.gen(function* () {
    const candidate = yield* CreateExtension.prepare(args.request).pipe(
      Effect.mapError(failureToAppError),
    );
    const { execution, recovery } = yield* makePlanInvocation(
      { preview: args.preview },
      { command: [], arguments: [] },
    );
    const resolution = yield* CreateExtension.previewOrApply(candidate, execution).pipe(
      Effect.mapError(failureToAppError),
    );
    yield* emitOperationResolution(resolution, {
      recovery,
      suggestions: args.suggestions(candidate),
    });
  });

/** Run one `<type> new` route end to end. */
export const runCreateExtensionCommand = (args: CreateExtensionCommandArgs) =>
  withOperationLifecycle(
    {
      mode: args.preview ? "preview" : "apply",
      planName: createExtensionPlanName(args.request.type),
    },
    body(args),
  );

/** What every `<type> new` route parses before the type's own flags. */
export interface NewExtensionArgs {
  /** The name as the person typed it; creation validates it. */
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly description: Option.Option<string>;
  readonly preview: boolean;
}

const newConfig = (noun: string) => ({
  name: Argument.String("name").pipe(
    withParameterDescription(`Name of the ${noun} to create, without owner`),
  ),
  owner: creationOwnerFlag,
  description: descriptionFlag,
  preview: previewCapabilityFlag(),
});

/**
 * Build one type's `new` route: the shared creation grammar with the type's
 * own flags after it, run in the default workspace, and the type's examples
 * after the two every route offers.
 */
export const makePerTypeNewCommand = <const Extras extends Command.Command.Config, R>(
  type: CreatableExtensionType,
  definition: {
    readonly description: string;
    readonly extraConfig: Extras;
    readonly examples?: ReadonlyArray<Command.Command.Example>;
    readonly handle: (
      args: Command.Command.Config.Infer<ReturnType<typeof newConfig> & Extras>,
    ) => Effect.Effect<void, ExpectedCliError, R>;
  },
) => {
  const { route, noun, exampleName } = extensionTypePresentation(type);
  const config = { ...newConfig(noun.singular), ...definition.extraConfig };
  return Command.make("new", config, (parsed) =>
    definition.handle(parsed).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime()),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(previewableCapabilities("authored-source")),
    Command.withDescription(definition.description),
    Command.withExamples([
      {
        command: `axm ${route} new ${exampleName}`,
        description: `Scaffold a new ${noun.singular}`,
      },
      {
        command: `axm ${route} new ${exampleName} --owner @acme`,
        description: "Create under a specific owner",
      },
      ...(definition.examples ?? []),
    ]),
  );
};
