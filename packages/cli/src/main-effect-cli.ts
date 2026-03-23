import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, CliError, Command, Flag, GlobalFlag } from "effect/unstable/cli";

import { loginCommand as loginCommandModule } from "./cli-commands/auth/login/command.js";
import { logoutCommand as logoutCommandModule } from "./cli-commands/auth/logout/command.js";
import { tokenCommand as tokenCommandModule } from "./cli-commands/auth/token/command.js";
import { whoamiCommand as whoamiCommandModule } from "./cli-commands/auth/whoami/command.js";
import { installCommandCommand as commandsInstallCommandModule } from "./cli-commands/commands/install/command.js";
import { uninstallCommandCommand as commandsUninstallCommandModule } from "./cli-commands/commands/uninstall/command.js";
import { initCommand as initCommandModule } from "./cli-commands/init/command.js";
import { installMcpServerCommand as mcpServersInstallCommandModule } from "./cli-commands/mcp-servers/install/command.js";
import { uninstallMcpServerCommand as mcpServersUninstallCommandModule } from "./cli-commands/mcp-servers/uninstall/command.js";
import { packsAddCommand as packsAddCommandModule } from "./cli-commands/packs/add/command.js";
import { installPackCommand as packsInstallCommandModule } from "./cli-commands/packs/install/command.js";
import { packsNewCommand as packsNewCommandModule } from "./cli-commands/packs/new/command.js";
import { publishPackCommand as packsPublishCommandModule } from "./cli-commands/packs/publish/command.js";
import { packsRemoveCommand as packsRemoveCommandModule } from "./cli-commands/packs/remove/command.js";
import { uninstallPackCommand as packsUninstallCommandModule } from "./cli-commands/packs/uninstall/command.js";
import { unpackCommand as packsUnpackCommandModule } from "./cli-commands/packs/unpack/command.js";
import { disableCommand as skillsDisableCommandModule } from "./cli-commands/skills/disable/command.js";
import { enableCommand as skillsEnableCommandModule } from "./cli-commands/skills/enable/command.js";
import { forkCommand as skillsForkCommandModule } from "./cli-commands/skills/fork/command.js";
import { installCommand as skillsInstallCommandModule } from "./cli-commands/skills/install/command.js";
import { listCommand as skillsListCommandModule } from "./cli-commands/skills/list/command.js";
import { skillsNewCommand as skillsNewCommandModule } from "./cli-commands/skills/new/command.js";
import { publishCommand as skillsPublishCommandModule } from "./cli-commands/skills/publish/command.js";
import { renameCommand as skillsRenameCommandModule } from "./cli-commands/skills/rename/command.js";
import { uninstallCommand as skillsUninstallCommandModule } from "./cli-commands/skills/uninstall/command.js";
import { updateCommand as skillsUpdateCommandModule } from "./cli-commands/skills/update/command.js";
import { DEFAULT_WORKSPACE_SCOPE, WORKSPACE_SCOPES } from "./workspace/scope.js";
import { loadVersion } from "./version.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();

type AnyCommand = Command.Command.Any;
type CommandConfig = Command.Command.Config;
type Example = Readonly<{ command: string; description: string }>;
type CommandHandler<Argv extends object> = ((argv: Argv) => unknown) | undefined;
const cliCommandRef: { current: AnyCommand | undefined } = { current: undefined };

interface EffectCliExit {
  readonly _tag: "EffectCliExit";
  readonly exitCode: number;
}

const effectCliExit = (exitCode: number): EffectCliExit => ({
  _tag: "EffectCliExit",
  exitCode,
});

const isEffectCliExit = (error: unknown): error is EffectCliExit =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "EffectCliExit" &&
  "exitCode" in error &&
  typeof error.exitCode === "number";

const getCliCommand = (): AnyCommand => {
  if (cliCommandRef.current === undefined) {
    throw new Error("CLI command not initialized");
  }

  return cliCommandRef.current;
};

const runCommandHandler = <Argv extends object>(
  handler: CommandHandler<Argv>,
  argv: Argv,
): Effect.Effect<void, unknown, unknown> =>
  Effect.promise(async () => {
    if (handler === undefined) {
      throw new Error("Missing CLI command handler");
    }

    await Promise.resolve(handler(argv));
  });

const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

const yesFlag = GlobalFlag.setting("axm-yes")({
  flag: Flag.boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription("Auto-accept confirmation prompts"),
  ),
});

const forceFlag = GlobalFlag.setting("axm-force")({
  flag: Flag.boolean("force").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Override constraints that would cause failure"),
  ),
});

const previewFlag = GlobalFlag.setting("axm-preview")({
  flag: Flag.boolean("preview").pipe(Flag.withDescription("Display plan without applying")),
});

const verboseFlag = GlobalFlag.setting("axm-verbose")({
  flag: Flag.boolean("verbose").pipe(
    Flag.withAlias("v"),
    Flag.withDescription("Show additional diagnostic details for errors"),
  ),
});

const debugFlag = GlobalFlag.setting("axm-debug")({
  flag: Flag.boolean("debug").pipe(
    Flag.withDescription("Show full debug details for errors (implies --verbose)"),
  ),
});

const axmGlobalFlags = [
  nonInteractiveFlag,
  yesFlag,
  forceFlag,
  previewFlag,
  verboseFlag,
  debugFlag,
] as const;

const baseArgv = Effect.gen(function* () {
  const nonInteractive = yield* nonInteractiveFlag;
  const yes = yield* yesFlag;
  const force = yield* forceFlag;
  const preview = yield* previewFlag;
  const verbose = yield* verboseFlag;
  const debug = yield* debugFlag;

  return {
    "non-interactive": Option.getOrUndefined(nonInteractive),
    yes,
    force,
    preview,
    verbose,
    debug,
  } satisfies Record<string, unknown>;
});

const executeCommand = <Argv extends object>(handler: CommandHandler<Argv>) =>
  (argv: Argv): Effect.Effect<void, unknown, unknown> =>
    Effect.gen(function* () {
      const inheritedArgv = yield* baseArgv;
      yield* runCommandHandler(handler, {
        ...inheritedArgv,
        ...argv,
      } as Argv);
    });

const showHelpFor = (command: AnyCommand, commandPath: ReadonlyArray<string>) =>
  GlobalFlag.Help.run(true, {
    command,
    commandPath,
    version,
  });

const stringArrayFlag = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.atLeast(0));

const optionalStringArrayFlag = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.atLeast(1), Flag.optional);

const scopeFlag = () =>
  Flag.choice("scope", WORKSPACE_SCOPES).pipe(
    Flag.withDescription("Configuration scope: project (default) or user"),
    Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
  );

const optionalTextFlag = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional);

const makeLeafCommand = <Config extends CommandConfig>(
  name: string,
  config: Config,
  options: {
    readonly alias?: string;
    readonly description: string;
    readonly examples?: ReadonlyArray<Example>;
    readonly handler: (input: Command.Command.Config.Infer<Config>) => Effect.Effect<void, unknown, unknown>;
  },
) => {
  let command: AnyCommand = Command.make(name, config, options.handler).pipe(
    Command.withDescription(options.description),
  );

  if (options.alias !== undefined) {
    command = command.pipe(Command.withAlias(options.alias));
  }

  if (options.examples !== undefined && options.examples.length > 0) {
    command = command.pipe(Command.withExamples(options.examples));
  }

  return command;
};

const makeGroupCommand = (
  name: string,
  description: string,
  subcommands: ReadonlyArray<AnyCommand>,
  examples: ReadonlyArray<Example> = [],
) => {
  let command: AnyCommand = Command.make(name, {}, () =>
    showHelpFor(getCliCommand(), [ROOT_COMMAND, name]),
  ).pipe(Command.withDescription(description));

  if (examples.length > 0) {
    command = command.pipe(Command.withExamples(examples));
  }

  return command.pipe(Command.withSubcommands(subcommands));
};

const loginCommand = makeLeafCommand("login", {}, {
  description: "Sign in to a registry",
  examples: [{ command: "axm login", description: "Sign in to the default registry" }],
  handler: () => executeCommand(loginCommandModule.handler)({}),
});

const logoutCommand = makeLeafCommand("logout", {}, {
  description: "Sign out of a registry",
  handler: () => executeCommand(logoutCommandModule.handler)({}),
});

const whoamiCommand = makeLeafCommand(
  "whoami",
  {
    json: Flag.boolean("json").pipe(Flag.withDescription("Output identity as JSON")),
  },
  {
    description: "Show current authenticated identity",
    examples: [{ command: "axm whoami", description: "Show current authenticated identity" }],
    handler: ({ json }) => executeCommand(whoamiCommandModule.handler)({ json }),
  },
);

const tokenCommand = makeLeafCommand("token", {}, {
  description: "Output current auth token to stdout",
  examples: [{ command: "axm token", description: "Output current auth token to stdout" }],
  handler: () => executeCommand(tokenCommandModule.handler)({}),
});

const authCommand = makeGroupCommand("auth", "Manage authentication", [
  loginCommand,
  logoutCommand,
  whoamiCommand,
  tokenCommand,
]);

const initCommand = makeLeafCommand(
  "init",
  {
    scope: scopeFlag(),
    agent: stringArrayFlag("agent", "Specify agent(s) to configure (skips auto-detection)"),
  },
  {
    description: "Set up axm in the current project",
    examples: [
      { command: "axm init", description: "Detect installed agents and create .axm/settings.json" },
      {
        command: "axm init --non-interactive",
        description: "Initialize with all detected agents (no prompts)",
      },
      { command: "axm init --scope user", description: "Initialize in ~/.axm/ for user scope" },
      {
        command: "axm init --agent claude-code --agent cursor",
        description: "Initialize with specific agents",
      },
    ],
    handler: ({ scope, agent }) =>
      executeCommand(initCommandModule.handler)({
        scope,
        agent,
      }),
  },
);

const skillsInstallCommand = makeLeafCommand(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("GitHub shorthand (owner/repo), local path, or URL"),
    ),
    scope: scopeFlag(),
    skill: stringArrayFlag("skill", "Install only specified skill(s) by name"),
    all: Flag.boolean("all").pipe(Flag.withDescription("Install all discovered skills")),
  },
  {
    description: "Install skills from GitHub or local path",
    examples: [
      { command: "axm skills install owner/repo", description: "Install skills interactively" },
      {
        command: "axm skills install owner/repo@v1.0.0",
        description: "Install from a specific tag, branch, or commit",
      },
      {
        command: "axm skills install ./path/to/skills",
        description: "Install from a local directory",
      },
      {
        command: "axm skills install owner/repo --all --yes",
        description: "Install all without prompts",
      },
      {
        command: "axm skills install owner/repo --skill pr-review",
        description: "Target a specific skill",
      },
    ],
    handler: ({ source, scope, skill, all }) =>
      executeCommand(skillsInstallCommandModule.handler)({
        source,
        scope,
        skill,
        all,
      }),
  },
);

const skillsUninstallCommand = makeLeafCommand(
  "uninstall",
  {
    skill: Argument.string("skill").pipe(
      Argument.withDescription("Name of the skill to uninstall"),
    ),
  },
  {
    description: "Uninstall a skill from agents",
    examples: [
      { command: "axm skills uninstall my-skill", description: "Uninstall a skill" },
      {
        command: "axm skills uninstall my-skill --preview",
        description: "Preview what would be uninstalled",
      },
      {
        command: "axm skills uninstall my-skill --yes",
        description: "Uninstall without confirmation prompt",
      },
    ],
    handler: ({ skill }) =>
      executeCommand(skillsUninstallCommandModule.handler)({
        skill,
      }),
  },
);

const skillsListCommand = makeLeafCommand(
  "list",
  {
    scope: scopeFlag(),
    agent: stringArrayFlag("agent", "Filter by agent(s)"),
  },
  {
    alias: "ls",
    description: "List installed skills",
    examples: [
      { command: "axm skills list", description: "List all installed skills" },
      {
        command: "axm skills list --scope user",
        description: "List user-scope installed skills",
      },
      {
        command: "axm skills list --agent claude-code",
        description: "List skills for a specific agent",
      },
    ],
    handler: ({ scope, agent }) =>
      executeCommand(skillsListCommandModule.handler)({
        scope,
        agent,
      }),
  },
);

const skillsNewCommand = makeLeafCommand(
  "new",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the skill (without namespace)"),
    ),
    namespace: optionalTextFlag("namespace", "Override the workspace namespace (e.g., @acme)"),
    agent: optionalStringArrayFlag("agent", "Agent IDs to target (can be repeated)"),
  },
  {
    description: "Create a new skill",
    examples: [
      { command: "axm skills new my-skill", description: "Create a new skill" },
      {
        command: "axm skills new my-skill --namespace @acme",
        description: "Create with custom namespace",
      },
    ],
    handler: ({ name, namespace, agent }) =>
      executeCommand(skillsNewCommandModule.handler)({
        name,
        namespace: Option.getOrUndefined(namespace),
        agent: Option.map(agent, (value) => [...value]).pipe(Option.getOrUndefined),
      }),
  },
);

const skillsForkCommand = makeLeafCommand(
  "fork",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Installed skill name, glob pattern, or source string (local path, github:owner/repo, etc.)",
      ),
    ),
    skill: stringArrayFlag("skill", "Fork only specified skill(s) by name or glob pattern"),
  },
  {
    description: "Fork a skill for customization",
    examples: [
      {
        command: "axm skills fork my-skill",
        description: "Fork an installed skill to a managed extension",
      },
      {
        command: 'axm skills fork "effect-*"',
        description: "Fork all local skills matching the glob",
      },
      {
        command: "axm skills fork github:owner/repo",
        description: "Fork a skill from a GitHub repo",
      },
      {
        command: 'axm skills fork ./local/path --skill "effect-*"',
        description: "Fork matching skills from a local source",
      },
    ],
    handler: ({ source, skill }) =>
      executeCommand(skillsForkCommandModule.handler)({
        source,
        skill: [...skill],
      }),
  },
);

const skillsPublishCommand = makeLeafCommand(
  "publish",
  {
    extensions: Argument.string("extensions").pipe(
      Argument.withDescription(
        "Extension names or glob patterns (@namespace/skills/name, bare name, or glob)",
      ),
      Argument.atLeast(1),
    ),
    registry: optionalTextFlag("registry", "Named registry source to publish to"),
  },
  {
    description: "Publish extensions to a registry",
    examples: [
      {
        command: "axm skills publish @acme/skills/code-review",
        description: "Publish a single extension",
      },
      {
        command: "axm skills publish effect-* commit",
        description: "Publish extensions matching patterns",
      },
      {
        command: "axm skills publish code-review --registry local",
        description: "Publish with namespace from settings to the local registry",
      },
    ],
    handler: ({ extensions, registry }) =>
      executeCommand(skillsPublishCommandModule.handler)({
        extensions: [...extensions],
        registry: Option.getOrUndefined(registry),
      }),
  },
);

const skillsUpdateCommand = makeLeafCommand(
  "update",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Filter to skills from a specific source (owner/repo, path, or URL)",
      ),
      Argument.optional,
    ),
    scope: scopeFlag(),
    agent: stringArrayFlag("agent", "Update only skills for specified agent(s)"),
    skill: stringArrayFlag("skill", "Update only specified skill(s) by name or glob"),
  },
  {
    description: "Update installed skills to latest versions",
    examples: [
      { command: "axm skills update", description: "Update all installed skills" },
      {
        command: "axm skills update owner/repo",
        description: "Update skills from a specific source",
      },
      {
        command: "axm skills update --skill pr-review",
        description: "Update a specific skill by name",
      },
      {
        command: "axm skills update --yes",
        description: "Update all skills without confirmation",
      },
    ],
    handler: ({ source, scope, agent, skill }) =>
      executeCommand(skillsUpdateCommandModule.handler)({
        source: Option.getOrUndefined(source),
        scope,
        agent,
        skill,
      }),
  },
);

const skillsEnableCommand = makeLeafCommand(
  "enable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
    scope: scopeFlag(),
  },
  {
    description: "Enable a previously disabled skill",
    handler: ({ name, scope }) =>
      executeCommand(skillsEnableCommandModule.handler)({
        name,
        scope,
      }),
  },
);

const skillsDisableCommand = makeLeafCommand(
  "disable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to disable")),
    scope: scopeFlag(),
  },
  {
    description: "Disable a skill without uninstalling it",
    handler: ({ name, scope }) =>
      executeCommand(skillsDisableCommandModule.handler)({
        name,
        scope,
      }),
  },
);

const skillsRenameCommand = makeLeafCommand(
  "rename",
  {
    oldName: Argument.string("old-name").pipe(
      Argument.withDescription("Current name of the skill"),
    ),
    newName: Argument.string("new-name").pipe(
      Argument.withDescription("New name for the skill"),
    ),
    scope: scopeFlag(),
  },
  {
    description: "Rename a skill",
    examples: [
      { command: "axm skills rename old-name new-name", description: "Rename a skill" },
      {
        command: "axm skills rename old-name new-name --preview",
        description: "Preview what would be renamed",
      },
    ],
    handler: ({ oldName, newName, scope }) =>
      executeCommand(skillsRenameCommandModule.handler)({
        "old-name": oldName,
        "new-name": newName,
        scope,
      }),
  },
);

const skillsCommand = makeGroupCommand(
  "skills",
  "Install, update, and manage skills",
  [
    skillsInstallCommand,
    skillsUninstallCommand,
    skillsListCommand,
    skillsNewCommand,
    skillsForkCommand,
    skillsPublishCommand,
    skillsUpdateCommand,
    skillsEnableCommand,
    skillsDisableCommand,
    skillsRenameCommand,
  ],
  [
    {
      command: "axm skills install owner/repo",
      description: "Install skills from a GitHub repository",
    },
    {
      command: "axm skills install owner/repo@v1.0.0",
      description: "Install skills from a specific version",
    },
    {
      command: "axm skills install ./local/path",
      description: "Install skills from a local directory",
    },
    { command: "axm skills list", description: "List installed skills" },
  ],
);

const packsInstallCommand = makeLeafCommand(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Registry pack reference (@namespace/packs/name, @namespace/packs/name@version, or bare pack-name)",
      ),
    ),
    scope: scopeFlag(),
  },
  {
    description: "Install a pack and its extensions from a registry",
    examples: [
      {
        command: "axm packs install @acme/packs/frontend-tools",
        description: "Install a pack and all referenced extensions",
      },
      {
        command: "axm packs install @acme/packs/frontend-tools@^2.0.0",
        description: "Install a specific version range",
      },
      {
        command: "axm packs install frontend-tools",
        description: "Install using the default namespace",
      },
      {
        command: "axm packs install @acme/packs/frontend-tools --preview",
        description: "See what would be installed",
      },
    ],
    handler: ({ source, scope }) =>
      executeCommand(packsInstallCommandModule.handler)({
        source,
        scope,
      }),
  },
);

const packsUninstallCommand = makeLeafCommand(
  "uninstall",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name or glob pattern of the pack to uninstall"),
    ),
  },
  {
    description: "Uninstall a pack",
    examples: [
      {
        command: "axm packs uninstall my-pack",
        description: "Uninstall a pack and its orphaned extensions",
      },
      {
        command: "axm packs uninstall my-pack --preview",
        description: "Preview what would be uninstalled",
      },
      {
        command: "axm packs uninstall my-pack --yes",
        description: "Uninstall without confirmation prompt",
      },
      {
        command: "axm packs uninstall acme-*",
        description: "Uninstall all packs matching a pattern",
      },
    ],
    handler: ({ name }) =>
      executeCommand(packsUninstallCommandModule.handler)({
        name,
      }),
  },
);

const packsNewCommand = makeLeafCommand(
  "new",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the pack (without namespace)"),
    ),
    namespace: optionalTextFlag("namespace", "Override the workspace namespace (e.g., @acme)"),
  },
  {
    description: "Create a new empty extension pack",
    examples: [
      {
        command: "axm packs new frontend-tools",
        description: "Create @<namespace>/frontend-tools",
      },
      {
        command: "axm packs new frontend-tools --namespace @co",
        description: "Create @co/frontend-tools",
      },
    ],
    handler: ({ name, namespace }) =>
      executeCommand(packsNewCommandModule.handler)({
        name,
        namespace: Option.getOrUndefined(namespace),
      }),
  },
);

const packsAddCommand = makeLeafCommand(
  "add",
  {
    pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
    extension: Argument.string("extension").pipe(
      Argument.withDescription("Extension name or glob pattern"),
    ),
  },
  {
    description: "Add an extension to a pack manifest",
    examples: [
      {
        command: "axm packs add frontend-tools @acme/skills/code-review",
        description: "Add a specific extension to a pack",
      },
      {
        command: 'axm packs add my-pack "effect-*"',
        description: "Add all matching extensions via glob",
      },
    ],
    handler: ({ pack, extension }) =>
      executeCommand(packsAddCommandModule.handler)({
        pack,
        extension,
      }),
  },
);

const packsRemoveCommand = makeLeafCommand(
  "remove",
  {
    pack: Argument.string("pack").pipe(Argument.withDescription("Name of the pack")),
    extension: Argument.string("extension").pipe(
      Argument.withDescription("Extension name or glob pattern"),
    ),
  },
  {
    description: "Remove an extension from a pack manifest",
    examples: [
      {
        command: "axm packs remove frontend-tools @acme/skills/code-review",
        description: "Remove a specific extension from a pack",
      },
      {
        command: 'axm packs remove my-pack "@acme/effect-*"',
        description: "Remove all matching extensions via glob",
      },
    ],
    handler: ({ pack, extension }) =>
      executeCommand(packsRemoveCommandModule.handler)({
        pack,
        extension,
      }),
  },
);

const packsPublishCommand = makeLeafCommand(
  "publish",
  {
    pack: Argument.string("pack").pipe(
      Argument.withDescription("Pack name (@namespace/name or bare name)"),
    ),
    registry: optionalTextFlag("registry", "Named registry source to publish to"),
    includeDependencies: Flag.boolean("include-dependencies").pipe(
      Flag.withAlias("d"),
      Flag.withDescription("Publish locally managed dependency extensions alongside the pack"),
    ),
  },
  {
    description: "Publish a pack to a registry",
    examples: [
      {
        command: "axm packs publish @acme/frontend-tools",
        description: "Publish to the default registry",
      },
      {
        command: "axm packs publish frontend-tools --registry local",
        description: "Publish with namespace from settings to the local registry",
      },
    ],
    handler: ({ pack, registry, includeDependencies }) =>
      executeCommand(packsPublishCommandModule.handler)({
        pack,
        registry: Option.getOrUndefined(registry),
        "include-dependencies": includeDependencies,
      }),
  },
);

const packsUnpackCommand = makeLeafCommand(
  "unpack",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Pack name to unpack")),
    strictAgentSync: Flag.boolean("strict-agent-sync").pipe(
      Flag.withDescription("Fail when MCP agent sync has strict-policy failures"),
    ),
  },
  {
    description: "Eject pack into individual entries",
    examples: [
      {
        command: "axm packs unpack @acme/frontend-tools",
        description: "Eject pack contents into settings",
      },
      {
        command: "axm packs unpack @acme/frontend-tools --preview",
        description: "See what would change in settings",
      },
    ],
    handler: ({ name, strictAgentSync }) =>
      executeCommand(packsUnpackCommandModule.handler)({
        name,
        "strict-agent-sync": strictAgentSync,
      }),
  },
);

const packsCommand = makeGroupCommand("packs", "Bundle and manage extension packs", [
  packsAddCommand,
  packsInstallCommand,
  packsNewCommand,
  packsPublishCommand,
  packsRemoveCommand,
  packsUninstallCommand,
  packsUnpackCommand,
]);

const commandsInstallCommand = makeLeafCommand(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("Registry command reference (@namespace/commands/name or bare name)"),
    ),
    scope: scopeFlag(),
  },
  {
    description: "Install a command from a registry",
    examples: [
      {
        command: "axm commands install @acme/commands/my-cmd",
        description: "Install a command from the registry",
      },
      {
        command: "axm commands install my-cmd",
        description: "Install using the default namespace",
      },
    ],
    handler: ({ source, scope }) =>
      executeCommand(commandsInstallCommandModule.handler)({
        source,
        scope,
      }),
  },
);

const commandsUninstallCommand = makeLeafCommand(
  "uninstall",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the command to uninstall")),
  },
  {
    description: "Uninstall a command",
    handler: ({ name }) =>
      executeCommand(commandsUninstallCommandModule.handler)({
        name,
      }),
  },
);

const commandsCommand = makeGroupCommand("commands", "Install and manage commands", [
  commandsInstallCommand,
  commandsUninstallCommand,
]);

const mcpServersInstallCommand = makeLeafCommand(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Registry MCP server reference (@namespace/mcp-servers/name or bare name)",
      ),
    ),
    scope: scopeFlag(),
  },
  {
    description: "Install an MCP server from a registry",
    examples: [
      {
        command: "axm mcp-servers install @acme/mcp-servers/my-server",
        description: "Install an MCP server from the registry",
      },
      {
        command: "axm mcp-servers install my-server",
        description: "Install using the default namespace",
      },
    ],
    handler: ({ source, scope }) =>
      executeCommand(mcpServersInstallCommandModule.handler)({
        source,
        scope,
      }),
  },
);

const mcpServersUninstallCommand = makeLeafCommand(
  "uninstall",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the MCP server to uninstall"),
    ),
  },
  {
    description: "Uninstall an MCP server",
    handler: ({ name }) =>
      executeCommand(mcpServersUninstallCommandModule.handler)({
        name,
      }),
  },
);

const mcpServersCommand = makeGroupCommand(
  "mcp-servers",
  "Install and manage MCP servers",
  [mcpServersInstallCommand, mcpServersUninstallCommand],
);

const cliCommand = Command.make(ROOT_COMMAND, {}, () =>
  showHelpFor(getCliCommand(), [ROOT_COMMAND]).pipe(
    Effect.andThen(Effect.fail(effectCliExit(1))),
  ),
).pipe(
  Command.withDescription("Open extension manager for AI coding agents."),
  Command.withExamples([
    { command: "axm init", description: "Initialize axm in the current project" },
    {
      command: "axm skills install owner/repo",
      description: "Install skills from a GitHub repository",
    },
    { command: "axm packs install owner/repo", description: "Install an extension pack" },
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Install a command from the registry",
    },
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Install an MCP server from the registry",
    },
    { command: "axm login", description: "Sign in to the default registry" },
    { command: "axm whoami", description: "Show the current authenticated identity" },
    { command: "axm token", description: "Output the current auth token to stdout" },
  ]),
  Command.withSubcommands([
    initCommand,
    skillsCommand,
    packsCommand,
    commandsCommand,
    mcpServersCommand,
    authCommand,
    loginCommand,
    logoutCommand,
    whoamiCommand,
    tokenCommand,
  ]),
  Command.withGlobalFlags(axmGlobalFlags),
);

cliCommandRef.current = cliCommand;

export const runEffectCli = async (
  args: ReadonlyArray<string> = process.argv.slice(2),
): Promise<void> => {
  try {
    await Effect.runPromise(
      Command.runWith(cliCommand, { version })(args).pipe(
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<void>,
    );
  } catch (error) {
    if (isEffectCliExit(error)) {
      process.exit(error.exitCode);
    }

    if (CliError.isCliError(error)) {
      process.exit(1);
    }

    console.error(error);
    process.exit(1);
  }
};

export { cliCommand };
