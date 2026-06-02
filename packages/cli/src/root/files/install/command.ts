import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { handleInstallFiles } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "files package source (@owner/files/name, path, URL, or git shorthand)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the files package already exists")),
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
          command: "files.install",
          type: Option.some("files"),
          planName: "Install configured files",
          planDescription: Option.some("Install configured files packages"),
          flags: { yes, force, preview },
        }),
      onSome: (value) => handleInstallFiles({ source: value }, { yes, force, preview }),
    }).pipe(withWorkspace(scope), withRuntime("files install")),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install files packages"),
  Command.withExamples([
    {
      command: "axm files install",
      description: "Reinstall configured files packages",
    },
    {
      command: "axm files install @acme/files/workspace-baseline",
      description: "Install a files package from the registry",
    },
  ]),
);
