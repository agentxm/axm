import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handlePublishPack } from "../../cli-commands/packs/publish/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const publishCommand = Command.make(
  "publish",
  {
    pack: Argument.string("pack").pipe(
      Argument.withDescription("Pack name (@namespace/name or bare name)"),
    ),
    registry: Flag.string("registry").pipe(
      Flag.withDescription("Named registry source to publish to"),
      Flag.optional,
    ),
    includeDependencies: Flag.boolean("include-dependencies").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("Publish locally managed dependency extensions alongside the pack"),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ pack, registry, includeDependencies, yes, force, preview }) =>
    withCommandRuntime(handlePublishPack({ pack, registry, includeDependencies }), {
      command: "packs publish",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
      flags: { yes, force, preview },
    }),
).pipe(
  Command.withDescription("Publish a pack to a registry"),
  Command.withExamples([
    {
      command: "axm packs publish @acme/frontend-tools",
      description: "Publish to the default registry",
    },
    {
      command: "axm packs publish frontend-tools --registry local",
      description: "Publish with namespace from settings to the local registry",
    },
  ]),
);
