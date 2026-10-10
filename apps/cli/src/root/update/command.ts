import { withParameterDescription } from "../../cli-parameters.js";
import { Argument, Command } from "effect/cli";

import { ignoreReleaseAgeFlag, reinstallFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { handleUpdate } from "./handler.js";

const updateConfig = {
  source: Argument.String("extension").pipe(
    withParameterDescription(
      "Installed extension FQN; optional @version constrains registry sources only",
    ),
    Argument.optional,
  ),
  scope: scopeFlag,
  reinstall: reinstallFlag,
  preview: previewCapabilityFlag(),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, reinstall, preview, ignoreReleaseAge }) =>
    handleUpdate({ source, reinstall, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("update"),
    ),
).pipe(
  withArgvTracking(updateConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Advance accepted resolutions within each source's selection intent"),
  Command.withShortDescription("Advance installed extensions to newer versions"),
  Command.withExamples([
    {
      command: "axm update",
      description: "Update all configured extensions in the current workspace",
    },
    {
      command: "axm update @acme/skills/code-review",
      description: "Update an installed extension by FQN, regardless of source family",
    },
    {
      command: "axm update @acme/hooks/session-audit@^1.2.0",
      description: "Update a registry extension within a version constraint",
    },
    {
      command: "axm update @acme/skills/code-review --ignore-release-age",
      description: "Review and bypass minimum release age for one targeted update",
    },
    {
      command: "axm update --preview",
      description: "Preview updates without applying them",
    },
  ]),
);
