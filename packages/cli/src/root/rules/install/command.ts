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
import { handleInstallRule } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("rule source (@owner/rules/name, path, URL, or git shorthand)"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall a rule that already exists")),
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
          command: "rules.install",
          type: Option.some("rule"),
          planName: "Install configured rules",
          planDescription: Option.some("Install configured rules"),
          flags: { yes, preview },
        }),
      onSome: (value) => handleInstallRule({ source: value }, { yes, force, preview }),
    }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("rules install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install rules"),
  Command.withExamples([
    {
      command: "axm rules install",
      description: "Reinstall configured rules",
    },
    {
      command: "axm rules install @acme/rules/commit-style",
      description: "Install a rule from the registry",
    },
  ]),
);
