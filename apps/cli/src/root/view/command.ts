import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { handleDefaultRegistryFqnView, handleView } from "./handler.js";

const viewConfig = {
  handle: Argument.string("extension").pipe(
    Argument.withDescription("Fully-qualified extension handle (@owner/skills/name)"),
  ),
  field: Argument.string("field").pipe(
    Argument.withDescription(
      "Optional field: version, versions, latest, description, owner, type, visibility",
    ),
    Argument.optional,
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  // Pack is excluded by the identifier resolver because containers have no
  // per-type installed-name map. Fully qualified pack identities still work.
  type: Flag.choice("type", [...CATALOG_EXTENSION_TYPES]).pipe(
    Flag.withDescription("Non-container extension type for bare-name lookup"),
    Flag.optional,
  ),
} as const;

export const viewCommand = Command.make("view", viewConfig, ({ handle, field, registry, type }) => {
  const parts = parseExtensionFqnParts(handle);
  if (Option.isNone(registry) && Option.isNone(type) && parts !== undefined) {
    return handleDefaultRegistryFqnView({ handle, field, parts }).pipe(withRuntime("view"));
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
