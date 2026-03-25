import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handlePublishPack } from "../../cli-commands/packs/publish/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

const publishConfig = {
  pack: Argument.string("pack").pipe(
    Argument.withDescription("Pack name (@profile/name or bare name)"),
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
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ pack, registry, includeDependencies, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handlePublishPack({ pack, registry, includeDependencies }),
      ),
      { command: "packs publish", flags: { yes, force, preview } },
    ),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish a pack to a registry"),
  Command.withExamples([
    {
      command: "axm packs publish @acme/frontend-tools",
      description: "Publish to the default registry",
    },
    {
      command: "axm packs publish frontend-tools --registry local",
      description: "Publish with profile from settings to the local registry",
    },
  ]),
);
