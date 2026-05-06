import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { handleView } from "./handler.js";

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
} as const;

export const viewCommand = Command.make("view", viewConfig, ({ handle, field, registry }) =>
  handleView({ handle, field, registry }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withAuthRuntime("view"),
  ),
).pipe(
  withArgvTracking(viewConfig),
  Command.withDescription("View published extension metadata"),
  Command.withExamples([
    {
      command: "axm view @acme/skills/code-review",
      description: "Show published metadata for an extension",
    },
    {
      command: "axm view @acme/commands/my-cmd version",
      description: "Print the latest published version",
    },
    {
      command: "axm view @acme/skills/code-review versions --json",
      description: "Emit published versions as JSON",
    },
  ]),
);
