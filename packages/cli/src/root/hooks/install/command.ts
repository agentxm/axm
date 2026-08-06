import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { handleInstallHook } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "hooks package source (@owner/hooks/name, path, URL, or git shorthand)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the hooks package already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    Option.match(source, {
      onNone: () =>
        handleWorkspaceInstall({
          command: "hooks.install",
          type: Option.some("hook"),
          planName: "Install configured hooks",
          planDescription: Option.some("Install configured hooks packages"),
          flags: { yes, preview },
        }),
      onSome: (value) => handleInstallHook({ source: value }, { yes, force, preview }),
    }).pipe(withWorkspace(scope), withRuntime("hooks install")),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install hooks packages"),
  Command.withExamples([
    {
      command: "axm hooks install",
      description: "Reinstall configured hooks packages",
    },
    {
      command: "axm hooks install @acme/hooks/workspace-baseline",
      description: "Install a hooks package from the registry",
    },
  ]),
);
