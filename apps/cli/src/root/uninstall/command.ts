import { withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/cli";
import { resolveRootUninstallIntent } from "@agentxm/workspace-features/lifecycle";

import { withArgvTracking } from "../../cli-runtime/index.js";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { handleUninstall } from "./handler.js";

const uninstallConfig = {
  source: Argument.String("extension").pipe(
    withParameterDescription("Unversioned extension FQN in @owner/<plural-type>/<name> form"),
  ),
  scope: scopeFlag,
  preview: previewCapabilityFlag(),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ source, scope, preview }) =>
    resolveRootUninstallIntent(source).pipe(
      Effect.mapError(failureToAppError),
      Effect.flatMap(() => handleUninstall({ source, preview }).pipe(withWorkspace(scope))),
      withRuntime("uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Remove an extension from the workspace"),
  Command.withExamples([
    {
      command: "axm uninstall @acme/skills/code-review",
      description: "Remove an installed skill by fully qualified registry name",
    },
    {
      command: "axm uninstall --preview @acme/hooks/session-audit",
      description: "Preview uninstalling a hook extension",
    },
    {
      command: "axm uninstall @acme/packs/frontend-tools --json",
      description: "Remove a pack and emit the result as JSON for scripts or CI",
    },
  ]),
);
