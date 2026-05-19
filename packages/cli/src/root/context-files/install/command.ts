import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { handleInstallContextFiles } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Context files package source (@owner/files/name, path, URL, or git shorthand)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(
    Flag.withDescription("Reinstall even if the context files package already exists"),
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
          command: "context-files.install",
          type: Option.some("file"),
          planName: "Install configured context files",
          planDescription: Option.some("Install configured context files packages"),
          flags: { yes, force, preview },
        }),
      onSome: (value) => handleInstallContextFiles({ source: value }, { yes, force, preview }),
    }).pipe(withWorkspace(scope), withRuntime("context-files install")),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install context files packages"),
  Command.withExamples([
    {
      command: "axm context-files install",
      description: "Reinstall configured context files packages",
    },
    {
      command: "axm context-files install @acme/files/workspace-baseline",
      description: "Install a context files package from the registry",
    },
  ]),
);
