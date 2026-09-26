/** Generate typed update routes over the configured workspace sweep. */

import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import type { WorkspaceUpdatableType } from "@agentxm/workspace/lifecycle";

import { ignoreReleaseAgeFlag, refreshFlag } from "../../cli-flags/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import { EXTENSION_TYPE_PRESENTATION } from "../extension-type-presentation.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { updateNameFilterFlag } from "../shared/update-targets.js";
import { handleWorkspaceUpdate } from "./workspace-update-handler.js";

type GeneratedUpdateType = Exclude<WorkspaceUpdatableType, "pack">;

export const makePerTypeUpdateCommand = (type: GeneratedUpdateType) => {
  const { route, noun, exampleName } = EXTENSION_TYPE_PRESENTATION[type];
  const common = {
    scope: scopeFlag.pipe(
      Flag.withDescription(
        `Update ${noun.plural} in project (default) or user-level configuration`,
      ),
    ),
    name: updateNameFilterFlag.pipe(
      Flag.withDescription(`Update only specific ${noun.plural} by name or glob pattern`),
    ),
    preview: previewCapabilityFlag("Show available updates without applying them"),
    ignoreReleaseAge: ignoreReleaseAgeFlag,
  } as const;
  const capabilities = previewableCapabilities("workspace", { trust: ["publisher-change"] });
  const description = `Update configured ${noun.plural} to the newest versions their sources offer`;
  const plan = {
    command: `${route}.update`,
    type: Option.some(type),
    planName: `Update ${noun.plural}`,
    planDescription: Option.some(`Update configured ${noun.plural}`),
  } as const;

  if (type === "mcp-server") {
    const config = {
      source: Flag.String("source").pipe(
        Flag.withDescription("Update every local connection from this exact MCP source"),
        Flag.optional,
      ),
      scope: common.scope,
      name: common.name,
      force: refreshFlag,
      preview: common.preview,
      ignoreReleaseAge: common.ignoreReleaseAge,
    } as const;
    return Command.make(
      "update",
      config,
      ({ source, scope, name, force, preview, ignoreReleaseAge }) =>
        handleWorkspaceUpdate({
          ...plan,
          flags: { preview, force },
          selector: {
            resourceType: type,
            source,
            nameFilters: name,
            sourceMayMatchName: false,
          },
        }).pipe(
          withReleaseAgePosture(ignoreReleaseAge),
          withWorkspace(scope),
          withRuntime(`${route} update`),
        ),
    ).pipe(
      withArgvTracking(config),
      withCommandCapabilities(capabilities),
      Command.withDescription(description),
      Command.withExamples([
        { command: `axm ${route} update`, description: `Update configured ${noun.plural}` },
        {
          command: `axm ${route} update --source @acme/mcps/${exampleName}`,
          description: "Update every local connection from one registry source",
        },
        {
          command: `axm ${route} update --name ${exampleName}-*`,
          description: `Update only ${noun.plural} matching a glob`,
        },
        {
          command: `axm ${route} update --preview`,
          description: `Preview ${noun.plural} updates`,
        },
      ]),
    );
  }

  const config = {
    source: Argument.String("source").pipe(
      Argument.withDescription(
        `Filter to ${noun.plural} matching a name or source (owner/repo, path, or URL)`,
      ),
      Argument.optional,
    ),
    ...common,
  } as const;
  return Command.make("update", config, ({ source, scope, name, preview, ignoreReleaseAge }) =>
    handleWorkspaceUpdate({
      ...plan,
      flags: { preview },
      selector: { resourceType: type, source, nameFilters: name },
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime(`${route} update`),
    ),
  ).pipe(
    withArgvTracking(config),
    withCommandCapabilities(capabilities),
    Command.withDescription(description),
    Command.withExamples([
      { command: `axm ${route} update`, description: `Update configured ${noun.plural}` },
      {
        command: `axm ${route} update --name ${exampleName}`,
        description: `Update one ${noun.singular} by name`,
      },
      {
        command: `axm ${route} update owner/repo`,
        description: `Update only ${noun.plural} from one source`,
      },
      { command: `axm ${route} update --preview`, description: "Preview available updates" },
    ]),
  );
};
