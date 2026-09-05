import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Option from "effect/Option";
import {
  ignoreReleaseAgeFlag,
  previewFlag,
  reinstallFlag,
  yesFlag,
} from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";
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
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall a hooks package that already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview, ignoreReleaseAge }) =>
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
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("hooks install"),
    ),
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
