import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { handlePublish } from "./handler.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../../runtime.js";
import { skipExistingFlag } from "../../shared/publish-flags.js";

const publishConfig = {
  extensions: Argument.string("extensions").pipe(
    Argument.withDescription(
      "Extension names or glob patterns (@owner/subagents/name, bare name, or glob)",
    ),
    Argument.atLeast(1),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Bypass version-order warnings; published versions remain immutable"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would be published without uploading")),
  skipExisting: skipExistingFlag,
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ extensions, registry, yes, force, preview, skipExisting }) => {
    const program = handlePublish({
      extensions: [...extensions],
      registry,
      yes,
      force,
      preview,
      skipExisting,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE));
    return program.pipe(Effect.provide(AuthLayer), withRuntime("subagents publish"));
  },
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish subagents to a registry"),
  Command.withExamples([
    {
      command: "axm subagents publish @acme/subagents/researcher",
      description: "Publish a subagent to the registry",
    },
    {
      command: "axm subagents publish research-* summarizer",
      description: "Publish multiple subagents matching a pattern",
    },
    {
      command: "axm subagents publish researcher --registry local",
      description: "Publish to a specific registry",
    },
  ]),
);
