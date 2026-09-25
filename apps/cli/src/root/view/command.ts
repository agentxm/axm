import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { handleDefaultRegistryFqnView, handleView } from "./handler.js";

const viewConfig = {
  handle: Argument.String("extension").pipe(
    Argument.withDescription("Fully-qualified extension handle (@owner/skills/name)"),
  ),
  field: Argument.String("field").pipe(
    Argument.withDescription(
      "Optional field: version, versions, latest, description, owner, type, visibility, lifecycle-state, archival, deprecation",
    ),
    Argument.optional,
  ),
  registry: Flag.String("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  type: Flag.Literals("type", [...installableExtensionTypes]).pipe(
    Flag.withDescription("Extension type for bare-name lookup"),
    Flag.optional,
  ),
} as const;

export const viewCommand = Command.make("view", viewConfig, ({ handle, field, registry, type }) => {
  const parts = parseExtensionFqnParts(handle);
  // A fully qualified handle needs no workspace to name what it views; the
  // effective default Registry is still the settings-selected one, so the
  // workspace is read as it is, initialized or not.
  if (Option.isNone(registry) && Option.isNone(type) && parts !== undefined) {
    return handleDefaultRegistryFqnView({ handle, field, parts }).pipe(
      withWorkspace({ scope: DEFAULT_WORKSPACE_SCOPE, allowUninitialized: true }),
      withRuntime("view"),
    );
  }
  return handleView({ handle, field, registry, type }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("view"),
  );
}).pipe(
  withArgvTracking(viewConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("View published extension metadata"),
  Command.withExamples([
    {
      command: "axm view @acme/skills/code-review",
      description: "Show published metadata for an extension",
    },
    {
      command: "axm view @acme/subagents/reviewer version",
      description: "Print the latest published version",
    },
    {
      command: "axm view @acme/skills/code-review versions --json",
      description: "Emit published versions as JSON",
    },
  ]),
);
