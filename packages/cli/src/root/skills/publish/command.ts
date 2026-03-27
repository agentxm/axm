import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handlePublish } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

const publishConfig = {
  extensions: Argument.string("extensions").pipe(
    Argument.withDescription(
      "Extension names or glob patterns (@profile/skills/name, bare name, or glob)",
    ),
    Argument.atLeast(1),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Named registry source to publish to"),
    Flag.optional,
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ extensions, registry, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handlePublish({ extensions: [...extensions], registry, yes, force, preview }),
      ),
      { command: "skills publish" },
    ),
).pipe(
  withArgvTracking(publishConfig),
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
      description: "Publish with profile from settings to the local registry",
    },
  ]),
);
