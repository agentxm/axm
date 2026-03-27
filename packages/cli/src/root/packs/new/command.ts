import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handlePacksNew } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

const newConfig = {
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
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, profile, yes, force, preview }) =>
  withRuntime(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE, handlePacksNew({ name, profile, yes, force, preview })),
    { command: "packs new" },
  ),
).pipe(
  withArgvTracking(newConfig),
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
