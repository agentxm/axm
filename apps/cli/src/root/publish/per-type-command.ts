import { ownerHandleFlag } from "../../cli-flags/owner-handle.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/cli";

import { acceptWarningsFlag, registryFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions";
import {
  normalizeTypePublishSelection,
  type PublishableType,
} from "@agentxm/workspace-features/publishing";
import { failureToAppError } from "../../app-error/conversions.js";

import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { backfillFlag } from "../shared/publish-flags.js";
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
      withParameterDescription("Name, glob, or FQN within this type"),
      Argument.atLeast(0),
    ),
    owner: ownerHandleFlag.pipe(
      withParameterDescription("Restrict to extensions of this owner handle"),
      Flag.atLeast(0),
    ),
    exclude: Flag.String("exclude").pipe(
      withParameterDescription("Exclude a matching name, glob, or FQN within this type"),
      Flag.atLeast(0),
    ),
    registry: registryFlag,
    backfill: backfillFlag,
    acceptWarnings: acceptWarningsFlag,
    visibility: Flag.Literals("visibility", ["public", "private"] as const).pipe(
      withParameterDescription("Initial visibility for every new extension in the selection"),
      Flag.optional,
    ),
    preview: previewCapabilityFlag(),
  } as const;

  const examples = [
    {
      command: `axm ${plural} publish`,
      description: `Publish every workspace-sourced ${plural} package`,
    },
    {
      command: `axm ${plural} publish example-*`,
      description: `Publish matching ${plural} packages`,
    },
  ];

  if (type === "pack") {
    const config = {
      ...commonConfig,
      includeDependencies: Flag.Boolean("include-dependencies").pipe(
        withParameterDescription("Include workspace-sourced dependencies of selected packs"),
        withParameterDefault(false),
      ),
    } as const;
    return Command.make("publish", config, (parsed) =>
      Effect.gen(function* () {
        const selection = yield* normalizeTypePublishSelection({
          type,
          selectors: parsed.extensions,
          owners: parsed.owner,
          excludes: parsed.exclude,
        }).pipe(Effect.mapError(failureToAppError));
        return yield* handleRootPublish({
          ...selection,
          registry: parsed.registry,
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
      }).pipe(
        withWorkspace("project"),
        withRuntime(`${plural} publish`, { registry: parsed.registry }),
      ),
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
      }).pipe(Effect.mapError(failureToAppError));
      return yield* handleRootPublish({
        ...selection,
        registry: parsed.registry,
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
    }).pipe(
      withWorkspace("project"),
      withRuntime(`${plural} publish`, { registry: parsed.registry }),
    ),
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
