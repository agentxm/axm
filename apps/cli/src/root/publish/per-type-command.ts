import { ownerHandleFlag } from "../../cli-flags/owner-handle.js";
import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/cli";

import { acceptWarningsFlag, registryFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
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
import { extensionTypePresentation } from "../extension-type-presentation.js";
import { handleRootPublish } from "./command.js";

/** Every publish form distributes authored content to a Registry. */
const publishCapabilities = previewableCapabilities("registry", {
  inputs: "explicit-or-documented-defaults",
});

export const makePerTypePublishCommand = (type: PublishableType) => {
  const { route } = extensionTypePresentation(type);
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

  const run = (
    parsed: Command.Command.Config.Infer<typeof commonConfig>,
    includeDependencies: boolean,
  ) =>
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
        includeDependencies,
        recoveryCommand: [route, "publish"],
        recoverySelectors: [...parsed.extensions],
        recoveryExcludes: [...parsed.exclude],
      });
    }).pipe(
      withWorkspace("project"),
      withRuntime(`${route} publish`, { registry: parsed.registry }),
    );

  const finish = <Name extends string, Input, ContextInput, E, R>(
    command: Command.Command<Name, Input, ContextInput, E, R>,
  ) =>
    command.pipe(
      withCommandCapabilities(publishCapabilities),
      Command.withDescription(`Publish project-workspace ${route} to a registry`),
      Command.withExamples([
        {
          command: `axm ${route} publish`,
          description: `Publish every workspace-sourced ${route} package`,
        },
        {
          command: `axm ${route} publish example-*`,
          description: `Publish matching ${route} packages`,
        },
      ]),
    );

  if (type === "pack") {
    const config = {
      ...commonConfig,
      includeDependencies: Flag.Boolean("include-dependencies").pipe(
        withParameterDescription("Include workspace-sourced dependencies of selected packs"),
        withParameterDefault(false),
      ),
    } as const;
    return finish(
      Command.make("publish", config, (parsed) => run(parsed, parsed.includeDependencies)).pipe(
        withArgvTracking(config),
      ),
    );
  }
  return finish(
    Command.make("publish", commonConfig, (parsed) => run(parsed, false)).pipe(
      withArgvTracking(commonConfig),
    ),
  );
};

export const skillsPublishCommand = makePerTypePublishCommand("skill");
export const mcpsPublishCommand = makePerTypePublishCommand("mcp-server");
export const subagentsPublishCommand = makePerTypePublishCommand("subagent");
export const hooksPublishCommand = makePerTypePublishCommand("hook");
export const knowledgePublishCommand = makePerTypePublishCommand("knowledge");
export const packsPublishCommand = makePerTypePublishCommand("pack");
export const rulesPublishCommand = makePerTypePublishCommand("rule");
