import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handlePacksNew } from "../../cli-commands/packs/new/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const newCommand = Command.make(
  "new",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the pack (without profile)"),
    ),
    profile: Flag.string("profile").pipe(
      Flag.withDescription("Override the workspace profile (e.g., @acme)"),
      Flag.optional,
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, profile, yes, force, preview }) =>
    withCommandRuntime(handlePacksNew({ name, profile }), {
      command: "packs new",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
      flags: { yes, force, preview },
    }),
).pipe(
  Command.withDescription("Create a new empty extension pack"),
  Command.withExamples([
    {
      command: "axm packs new frontend-tools",
      description: "Create @<profile>/frontend-tools",
    },
    {
      command: "axm packs new frontend-tools --profile @co",
      description: "Create @co/frontend-tools",
    },
  ]),
);
