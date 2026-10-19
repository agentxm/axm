/** Generate the seven typed update routes over one configured workspace sweep. */
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";
import type { WorkspaceUpdatableType } from "@agentxm/workspace-features/lifecycle";
import { withParameterDescription } from "../../cli-parameters.js";
import {
  discardModifiedFlag,
  ignoreReleaseAgeFlag,
  reinstallFlag,
  replaceUnrecordedFlag,
} from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  withProjectionOutputPosture,
  withReleaseAgePosture,
  withRuntime,
  withWorkspace,
} from "../../runtime.js";
import { extensionTypePresentation } from "../extension-type-presentation.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";

export const makePerTypeUpdateCommand = (type: WorkspaceUpdatableType) => {
  const { route, noun, exampleName } = extensionTypePresentation(type);
  const config = {
    source: Flag.String("source").pipe(
      withParameterDescription(
        `Update only ${noun.plural} whose source is this registry FQN, Git locator, or path`,
      ),
      Flag.optional,
    ),
    name: Argument.String("name").pipe(
      withParameterDescription("Installed name or glob; omit to update all"),
      Argument.atLeast(0),
    ),
    scope: scopeFlag,
    reinstall: reinstallFlag,
    preview: previewCapabilityFlag(),
    ignoreReleaseAge: ignoreReleaseAgeFlag,
    replaceUnrecorded: replaceUnrecordedFlag,
    discardModified: discardModifiedFlag,
  } as const;
  return Command.make(
    "update",
    config,
    ({
      source,
      name,
      scope,
      reinstall,
      preview,
      ignoreReleaseAge,
      replaceUnrecorded,
      discardModified,
    }) =>
      handleWorkspaceUpdate({
        type: Option.some(type),
        planName: `Update ${noun.plural}`,
        planDescription: Option.some(`Update configured ${noun.plural}`),
        flags: { preview, reinstall },
        selector: { resourceType: type, source, nameFilters: name },
      }).pipe(
        withReleaseAgePosture(ignoreReleaseAge),
        withProjectionOutputPosture({ replaceUnrecorded, discardModified }),
        withWorkspace(scope),
        withRuntime(),
      ),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
    Command.withDescription(
      `Update configured ${noun.plural} to the newest versions their sources offer`,
    ),
    Command.withExamples([
      { command: `axm ${route} update`, description: `Update configured ${noun.plural}` },
      {
        command: `axm ${route} update ${exampleName}`,
        description: `Update one ${noun.singular} by name`,
      },
      {
        command: `axm ${route} update --source owner/repo`,
        description: `Update ${noun.plural} from one source`,
      },
      {
        command: `axm ${route} update --reinstall --preview`,
        description: "Preview forced reacquisition",
      },
    ]),
  );
};
