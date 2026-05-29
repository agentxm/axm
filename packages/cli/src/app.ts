/**
 * Root CLI application.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliOutput, Command, GlobalFlag } from "effect/unstable/cli";

import {
  InteractiveRenderer,
  MachineRenderer,
  resolveCliOutputPolicy,
} from "@agentxm/client-core/unstable/cli-renderer";
import { removeBuiltInFlag, runCliMain } from "@agentxm/client-core/unstable/cli-runtime";
import { InstallMethodLive } from "@agentxm/client-core/unstable/install-method";
import { UpdateCheckLive } from "@agentxm/client-core/unstable/update-check";

import { LearnMore, formatLearnMore, makeAxmFormatter } from "./formatter.js";
import { withUpdateCheck, resolveNonInteractiveFromArgv } from "./update-check-startup.js";

import { axmGlobalFlags, baseLayer, runtimeBaseLayer } from "./runtime.js";
import { loadVersion } from "./version.js";

import { setupCommand } from "./root/setup.js";
import { withCommandDocs } from "./root/docs-metadata.js";
import { agentsCommand } from "./root/agents/_agents.js";
import { rulesCommand } from "./root/rules/command.js";
import { skillsCommand } from "./root/skills/_skills.js";
import { packsCommand } from "./root/packs/_packs.js";
import { commandsCommand } from "./root/commands/_commands.js";
import { contextCommand } from "./root/context/_context.js";
import { mcpsCommand } from "./root/mcps/_mcps.js";
import { subagentsCommand } from "./root/subagents/_subagents.js";
import { authCommand } from "./root/auth/_auth.js";
import { loginCommand } from "./root/auth/login.js";
import { logoutCommand } from "./root/auth/logout.js";
import { whoamiCommand } from "./root/auth/whoami.js";
import { tokenCommand } from "./root/auth/token.js";
import { upgradeCommand } from "./root/upgrade/upgrade.js";
import { lintCommand } from "./root/lint/command.js";
import { discoverCommand } from "./root/discover/command.js";
import { installCommand } from "./root/install/command.js";
import { outdatedCommand } from "./root/outdated/command.js";
import { uninstallCommand } from "./root/uninstall/command.js";
import { pruneCommand } from "./root/prune/command.js";
import { syncCommand } from "./root/sync/command.js";
import { updateCommand } from "./root/update/command.js";
import { helpCommand } from "./root/help/command.js";
import { viewCommand } from "./root/view/command.js";
import { listsCommand } from "./root/lists/command.js";
import { versionCommand } from "./root/shared/version-command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();

removeBuiltInFlag(GlobalFlag.Completions);
removeBuiltInFlag(GlobalFlag.LogLevel);

const documentedSkillsCommand = withCommandDocs({
  category: "extensions",
  summary: "Manage agent skill extensions.",
  whenToUse:
    "Use this command family when creating, installing, publishing, or reconciling skills.",
  requirements: { workspace: true },
})(skillsCommand);

const documentedCommandsCommand = withCommandDocs({
  category: "extensions",
  summary: "Manage slash-command extensions.",
  whenToUse:
    "Use this command family when adding reusable slash commands to configured coding agents.",
  requirements: { workspace: true },
})(commandsCommand);

const documentedContextCommand = withCommandDocs({
  category: "extensions",
  summary: "Manage context package extensions.",
  whenToUse:
    "Use this command family when installing or publishing reusable files and project context.",
  requirements: { workspace: true },
})(contextCommand);

const documentedMcpsCommand = withCommandDocs({
  category: "extensions",
  summary: "Manage MCP server extensions.",
  whenToUse: "Use this command family when configuring MCP servers for supported agents.",
  requirements: { workspace: true },
})(mcpsCommand);

const documentedSubagentsCommand = withCommandDocs({
  category: "extensions",
  summary: "Manage subagent extensions.",
  whenToUse: "Use this command family when adding specialized agent personas and workflows.",
  requirements: { workspace: true },
})(subagentsCommand);

const documentedPacksCommand = withCommandDocs({
  category: "extensions",
  summary: "Manage extension bundles.",
  whenToUse:
    "Use this command family when composing or installing groups of related extensions together.",
  requirements: { workspace: true },
})(packsCommand);

const documentedInstallCommand = withCommandDocs({
  category: "extensions",
  summary: "Install a registry extension or reinstall configured extensions.",
  whenToUse:
    "Use this when adding published extensions to a workspace or rebuilding installed extension files.",
  requirements: { workspace: true, registry: true, network: true },
  sideEffects: { mutatesWorkspace: true, writesFiles: true, writesLockfile: true },
})(installCommand);

const documentedUpdateCommand = withCommandDocs({
  category: "extensions",
  summary: "Update configured extensions to newer versions.",
  whenToUse:
    "Use this when refreshing one extension or the full workspace to newer source versions.",
  requirements: { workspace: true, registry: true, network: true },
  sideEffects: { mutatesWorkspace: true, writesFiles: true, writesLockfile: true },
})(updateCommand);

const documentedUninstallCommand = withCommandDocs({
  category: "extensions",
  summary: "Remove an installed extension from the workspace.",
  whenToUse: "Use this when an extension should no longer be configured or materialized.",
  requirements: { workspace: true },
  sideEffects: { mutatesWorkspace: true, writesFiles: true, writesLockfile: true },
})(uninstallCommand);

const documentedOutdatedCommand = withCommandDocs({
  category: "extensions",
  summary: "Check installed extensions for newer versions.",
  whenToUse: "Use this before updating to see which configured extensions have newer releases.",
  requirements: { workspace: true, registry: true, network: true },
})(outdatedCommand);

const documentedViewCommand = withCommandDocs({
  category: "extensions",
  summary: "View registry metadata for an extension.",
  whenToUse: "Use this when inspecting a published extension before installing or updating it.",
  requirements: { registry: true, network: true },
})(viewCommand);

const documentedListsCommand = withCommandDocs({
  category: "extensions",
  summary: "Browse curated registry extension lists.",
  whenToUse: "Use this when discovering grouped extension recommendations from the registry.",
  requirements: { registry: true, network: true },
})(listsCommand);

const documentedVersionCommand = withCommandDocs({
  category: "extensions",
  summary: "Manage extension manifest versions.",
  whenToUse:
    "Use this when preparing a local extension for publishing with a semantic version change.",
  sideEffects: { writesFiles: true },
})(versionCommand);

const documentedSyncCommand = withCommandDocs({
  category: "workspace",
  summary: "Reconcile configured workspace extensions into agent files.",
  whenToUse:
    "Use this after changing settings, lockfiles, or agent targets to make local artifacts match.",
  requirements: { workspace: true, configuredAgents: true },
  sideEffects: { writesFiles: true },
})(syncCommand);

const documentedAgentsCommand = withCommandDocs({
  category: "workspace",
  summary: "Configure coding-agent targets.",
  whenToUse: "Use this command family when adding, removing, or inspecting the agents AXM manages.",
  requirements: { workspace: true },
  sideEffects: { mutatesWorkspace: true, writesFiles: true },
})(agentsCommand);

const documentedRulesCommand = withCommandDocs({
  category: "workspace",
  summary: "Manage rules capabilities for configured agents.",
  whenToUse: "Use this command family when enabling or inspecting workspace instruction files.",
  requirements: { workspace: true },
  sideEffects: { mutatesWorkspace: true, writesFiles: true },
})(rulesCommand);

const documentedLintCommand = withCommandDocs({
  category: "workspace",
  summary: "Validate workspace configuration and extension artifacts.",
  whenToUse:
    "Use this in local development and CI to find invalid manifests, missing files, or drift.",
  requirements: { workspace: true },
})(lintCommand);

const documentedPruneCommand = withCommandDocs({
  category: "workspace",
  summary: "Remove unmanaged or stale generated artifacts.",
  whenToUse: "Use this when cleaning up files that AXM no longer expects to manage.",
  requirements: { workspace: true },
  sideEffects: { writesFiles: true, destructive: true },
})(pruneCommand);

const documentedUpgradeCommand = withCommandDocs({
  category: "workspace",
  summary: "Upgrade local AXM workspace metadata.",
  whenToUse: "Use this after installing a newer AXM version that includes workspace migrations.",
  requirements: { workspace: true },
  sideEffects: { mutatesWorkspace: true, writesFiles: true },
})(upgradeCommand);

const documentedAuthCommand = withCommandDocs({
  category: "authentication",
  summary: "Manage registry authentication.",
  whenToUse: "Use this command family when signing in, signing out, or managing tokens.",
})(authCommand);

const documentedLoginCommand = withCommandDocs({
  category: "authentication",
  summary: "Sign in to the registry.",
  whenToUse: "Use this before commands that need authenticated registry access.",
  requirements: { network: true },
})(loginCommand);

const documentedLogoutCommand = withCommandDocs({
  category: "authentication",
  summary: "Remove saved registry credentials.",
  whenToUse: "Use this when ending a local authenticated session.",
  sideEffects: { writesFiles: true },
})(logoutCommand);

const documentedWhoamiCommand = withCommandDocs({
  category: "authentication",
  summary: "Show the current authenticated registry identity.",
  whenToUse: "Use this to verify which account AXM will use for registry operations.",
})(whoamiCommand);

const documentedTokenCommand = withCommandDocs({
  category: "authentication",
  summary: "Print or manage authentication tokens.",
  whenToUse: "Use this for scripting, CI, and token lifecycle management.",
  requirements: { auth: true },
})(tokenCommand);

const documentedSetupCommand = withCommandDocs({
  category: "workspace",
  summary: "Initialize AXM management for a project or user scope.",
  whenToUse: "Use this first in a project to choose agents and install the default AXM skill.",
  sideEffects: { mutatesWorkspace: true, writesFiles: true, writesLockfile: true },
})(setupCommand);

const documentedDiscoverCommand = withCommandDocs({
  category: "workspace",
  summary: "Discover applicable extensions for the current workspace.",
  whenToUse: "Use this to inspect extension opportunities before installing anything.",
  requirements: { workspace: true },
})(discoverCommand);

const documentedHelpCommand = withCommandDocs({
  category: "help",
  summary: "Show help topics and schema reference output.",
  whenToUse: "Use this when you need conceptual guidance, manifest schemas, or command-line help.",
})(helpCommand);

export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Open extension manager for AI coding agents.\n  Manage skills, commands, context packages, MCP servers, and packs across your AI coding agents from a single CLI.",
  ),
  Command.withExamples([
    { command: "axm setup", description: "Start managing extensions in your project" },
    {
      command: "axm install @acme/skills/code-review",
      description: "Add a code review skill to your agents",
    },
    {
      command: "axm uninstall @acme/skills/code-review",
      description: "Remove an installed extension by registry FQN",
    },
    {
      command: "axm discover",
      description: "See what's available for your project",
    },
    { command: "axm whoami", description: "Check who you're authenticated as" },
  ]),
  withCommandDocs({
    category: "help",
    summary: "Open extension manager for AI coding agents.",
    whenToUse:
      "Use AXM to install, update, publish, and reconcile extensions across supported coding agents.",
    pageMode: "hidden",
  }),
  Command.withSubcommands([
    {
      group: "EXTENSIONS",
      commands: [
        documentedSkillsCommand,
        documentedCommandsCommand,
        documentedContextCommand,
        documentedMcpsCommand,
        documentedSubagentsCommand,
        documentedPacksCommand,
        documentedInstallCommand,
        documentedUpdateCommand,
        documentedUninstallCommand,
        documentedOutdatedCommand,
        documentedViewCommand,
        documentedListsCommand,
        documentedVersionCommand,
      ],
    },
    {
      group: "WORKSPACE",
      commands: [
        documentedSyncCommand,
        documentedAgentsCommand,
        documentedRulesCommand,
        documentedLintCommand,
        documentedPruneCommand,
        documentedUpgradeCommand,
      ],
    },
    {
      group: "AUTH",
      commands: [
        documentedAuthCommand,
        documentedLoginCommand,
        documentedLogoutCommand,
        documentedWhoamiCommand,
        documentedTokenCommand,
      ],
    },
    {
      group: "GETTING STARTED",
      commands: [documentedSetupCommand, documentedDiscoverCommand, documentedHelpCommand],
    },
  ]),
  Command.withGlobalFlags(axmGlobalFlags),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help getting-started", "Set up AXM in a new workspace"],
      ["axm help basic-usage", "Managing extensions and agents for an AXM workspace"],
      ["axm help skills", "How skill extensions work"],
      ["axm help", "Browse all help topics"],
    ]),
  ),
);

const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");

/** Layer providing UpdateCheck and InstallMethod for the startup update check. */
const updateCheckServicesLayer = Layer.provide(
  Layer.mergeAll(UpdateCheckLive, InstallMethodLive),
  runtimeBaseLayer,
);

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) => {
      const isJson = hasExplicitJsonFlag(argv);
      const commandProgram = Command.runWith(rootCommand, { version })(argv);
      const outputPolicy = resolveCliOutputPolicy();

      const rendererLayer = isJson ? MachineRenderer() : InteractiveRenderer({ outputPolicy });

      return withUpdateCheck(commandProgram, {
        localVersion: version,
        inputs: {
          args: argv,
          isNonInteractive: resolveNonInteractiveFromArgv(argv),
          isJsonOutput: isJson,
        },
      }).pipe(
        // Built-in --help / --version output is formatter-driven, so explicit
        // --json has to be reflected here before Effect CLI starts rendering.
        Effect.provide(
          Layer.mergeAll(
            baseLayer,
            updateCheckServicesLayer,
            rendererLayer,
            CliOutput.layer(makeAxmFormatter({ json: isJson, colors: outputPolicy.colors })),
          ),
        ),
      );
    },
    { args },
  );
};
