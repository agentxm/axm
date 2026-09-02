import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, reinstallFlag, yesFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { handleInstall, validateInstallArgsBeforeWorkspace } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry reference (@owner/skills/name), GitHub shorthand (owner/repo), local path, or URL",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  skill: Flag.string("skill").pipe(
    Flag.withDescription("Cherry-pick specific skills from a multi-skill source"),
    Flag.atLeast(0),
  ),
  all: Flag.boolean("all").pipe(
    Flag.withDescription("Install every skill found in the source without prompting"),
    Flag.withDefault(false),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall a skill that already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
  bundled: Flag.boolean("bundled").pipe(
    Flag.withDescription("Install the embedded official AXM skill without Registry access"),
    Flag.withDefault(false),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, skill, all, yes, force, preview, bundled }) => {
    const args = { source, skills: skill, all, bundled };
    return validateInstallArgsBeforeWorkspace(args).pipe(
      Effect.andThen(handleInstall(args, { yes, force, preview }).pipe(withWorkspace(scope))),
      withRuntime("skills install"),
    );
  },
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Reinstall configured skills from their sources, or install skills from a registry, GitHub, or local path",
  ),
  Command.withExamples([
    {
      command: "axm skills install",
      description: "Reinstall all configured skills from their sources",
    },
    {
      command: "axm skills install @acme/skills/code-review",
      description: "Add a code review skill to your agents",
    },
    {
      command: "axm skills install @acme/skills/code-review@^1.0.0",
      description: "Pin to a specific version range",
    },
    {
      command: "axm skills install owner/repo",
      description: "Install from a GitHub repository",
    },
    {
      command: "axm skills install ./path/to/skills",
      description: "Install from a local directory during development",
    },
    {
      command: "axm skills install owner/repo --all --yes",
      description: "CI: install all skills without prompts",
    },
    {
      command: "axm skills install @acme/skills/code-review --preview",
      description: "See what would be installed before committing",
    },
    {
      command: "axm skills install @agentxm/skills/axm --bundled",
      description: "Recover the compatible embedded AXM skill without network access",
    },
  ]),
);
