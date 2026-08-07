import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { parseExtensionFqnParts } from "@agentxm/client-core/unstable/extensions";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { handleDefaultRegistryFqnView, handleView } from "./handler.js";

const viewConfig = {
  handle: Argument.string("handle").pipe(
    Argument.withDescription("Fully-qualified extension handle (@owner/skills/name)"),
  ),
  field: Argument.string("field").pipe(
    Argument.withDescription("Optional field: version, versions, latest, description, owner, type"),
    Argument.optional,
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  type: Flag.choice("type", ["skill", "subagent"] as const).pipe(
    Flag.withDescription("Resource type for bare-name lookup"),
    Flag.optional,
  ),
} as const;

export const viewCommand = Command.make("view", viewConfig, ({ handle, field, registry, type }) => {
  const parts = parseExtensionFqnParts(handle);
  if (Option.isNone(registry) && Option.isNone(type) && parts !== undefined) {
    return handleDefaultRegistryFqnView({ handle, field, parts }).pipe(withAuthRuntime("view"));
  }
  return handleView({ handle, field, registry, type }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withAuthRuntime("view"),
  );
}).pipe(
  withArgvTracking(viewConfig),
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
