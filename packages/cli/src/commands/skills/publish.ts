import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handlePublish } from "../../cli-commands/skills/publish/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const publishCommand = Command.make(
  "publish",
  {
    extensions: Argument.string("extensions").pipe(
      Argument.withDescription(
        "Extension names or glob patterns (@namespace/skills/name, bare name, or glob)",
      ),
      Argument.atLeast(1),
    ),
    registry: Flag.string("registry").pipe(
      Flag.withDescription("Named registry source to publish to"),
      Flag.optional,
    ),
  },
  ({ extensions, registry }) =>
    withCommandRuntime(handlePublish({ extensions: [...extensions], registry }), {
      command: "skills publish",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
    }),
).pipe(
  Command.withDescription("Publish extensions to a registry"),
  Command.withExamples([
    {
      command: "axm skills publish @acme/skills/code-review",
      description: "Publish a single extension",
    },
    {
      command: "axm skills publish effect-* commit",
      description: "Publish extensions matching patterns",
    },
    {
      command: "axm skills publish code-review --registry local",
      description: "Publish with namespace from settings to the local registry",
    },
  ]),
);
