import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { acceptWarningsFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import { normalizeTypePublishSelection, type PublishableType } from "@agentxm/extension-publish";
import { publishFailureToAppError } from "../../feature-errors.js";

import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { backfillFlag, onExistingFlag } from "../shared/publish-flags.js";
import { handleRootPublish } from "./command.js";

/** Every publish form distributes authored content to a Registry. */
const publishCapabilities = previewableCapabilities("registry", {
  inputs: "explicit-or-documented-defaults",
});

type PerTypePublishType = PublishableType;

export const makePerTypePublishCommand = (type: PerTypePublishType) => {
  const plural = extensionTypeToPlural[type];
  const commonConfig = {
    extensions: Argument.String("name").pipe(
      Argument.withDescription("Bare names, globs, or fully-qualified extension names"),
      Argument.atLeast(0),
    ),
    owner: Flag.String("owner").pipe(Flag.withDescription("Filter by owner"), Flag.atLeast(0)),
    exclude: Flag.String("exclude").pipe(
      Flag.withDescription("Exclude a matching name, glob, or FQN"),
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
  } as const;

  const examples = [
    {
      command: `axm ${plural} publish`,
      description: `Publish every workspace-sourced ${plural} package`,
    },
    {
      command: `axm ${plural} publish example-* --on-existing verify`,
      description: `Publish matching ${plural} packages`,
    },
  ];

  if (type === "pack") {
    const config = {
      ...commonConfig,
      includeDependencies: Flag.Boolean("include-dependencies").pipe(
        Flag.withDescription("Include workspace-sourced dependencies of selected packs"),
        Flag.withDefault(false),
      ),
    } as const;
    return Command.make("publish", config, (parsed) =>
      Effect.gen(function* () {
        const selection = yield* normalizeTypePublishSelection({
          type,
          selectors: parsed.extensions,
          owners: parsed.owner,
          excludes: parsed.exclude,
        }).pipe(Effect.mapError(publishFailureToAppError));
        yield* handleRootPublish({
          ...selection,
          registry: parsed.registry,
          registryUrl: parsed.registryUrl,
          onExisting: parsed.onExisting,
          backfill: parsed.backfill,
          acceptWarnings: parsed.acceptWarnings,
          preview: parsed.preview,
          scope: "project",
          visibility: parsed.visibility,
          includeDependencies: parsed.includeDependencies,
          recoveryCommand: [plural, "publish"],
          recoverySelectors: [...parsed.extensions],
          recoveryExcludes: [...parsed.exclude],
        });
      }).pipe(withWorkspace("project"), withRuntime(`${plural} publish`)),
    ).pipe(
      withArgvTracking(config),
      withCommandCapabilities(publishCapabilities),
      Command.withDescription(`Publish project-workspace ${plural} to a registry`),
      Command.withExamples(examples),
    );
  }

  const config = commonConfig;
  return Command.make("publish", config, (parsed) =>
    Effect.gen(function* () {
      const selection = yield* normalizeTypePublishSelection({
        type,
        selectors: parsed.extensions,
        owners: parsed.owner,
        excludes: parsed.exclude,
      }).pipe(Effect.mapError(publishFailureToAppError));
      yield* handleRootPublish({
        ...selection,
        registry: parsed.registry,
        registryUrl: parsed.registryUrl,
        onExisting: parsed.onExisting,
        backfill: parsed.backfill,
        acceptWarnings: parsed.acceptWarnings,
        preview: parsed.preview,
        scope: "project",
        visibility: parsed.visibility,
        includeDependencies: false,
        recoveryCommand: [plural, "publish"],
        recoverySelectors: [...parsed.extensions],
        recoveryExcludes: [...parsed.exclude],
      });
    }).pipe(withWorkspace("project"), withRuntime(`${plural} publish`)),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(publishCapabilities),
    Command.withDescription(`Publish project-workspace ${plural} to a registry`),
    Command.withExamples(examples),
  );
};

export const skillsPublishCommand = makePerTypePublishCommand("skill");
export const mcpsPublishCommand = makePerTypePublishCommand("mcp-server");
export const subagentsPublishCommand = makePerTypePublishCommand("subagent");
export const hooksPublishCommand = makePerTypePublishCommand("hook");
export const knowledgePublishCommand = makePerTypePublishCommand("knowledge");
export const packsPublishCommand = makePerTypePublishCommand("pack");
export const rulesPublishCommand = makePerTypePublishCommand("rule");
