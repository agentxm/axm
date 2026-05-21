import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { handleInstallContext } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "context package source (@owner/context/name, path, URL, or git shorthand)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(
    Flag.withDescription("Reinstall even if the context package already exists"),
  ),
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
          command: "context.install",
          type: Option.some("context"),
          planName: "Install configured context",
          planDescription: Option.some("Install configured context packages"),
          flags: { yes, force, preview },
        }),
      onSome: (value) => handleInstallContext({ source: value }, { yes, force, preview }),
    }).pipe(withWorkspace(scope), withRuntime("context install")),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install context packages"),
  Command.withExamples([
    {
      command: "axm context install",
      description: "Reinstall configured context packages",
    },
    {
      command: "axm context install @acme/context/workspace-baseline",
      description: "Install a context package from the registry",
    },
  ]),
);
