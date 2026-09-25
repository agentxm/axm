/**
 * Root CLI application.
 */

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliError, CliOutput, Command } from "effect/unstable/cli";
import { format as formatConsoleArgs } from "node:util";

import { AppError, makeAppError } from "./app-error/index.js";
import {
  InteractiveScreen,
  MachineScreen,
  Screen,
  type OutputWriteFailed,
  resolveCliOutputPolicy,
  stderrIsTTY,
} from "./screen/index.js";
import { resolveVerbosityFromArgv } from "./cli-flags/index.js";
import {
  hasExplicitJsonFlag,
  optionArgs,
  outputSelectorsFromArgv,
  resolveFormatFromArgv,
  runCliMain,
  processOutcome,
  getOperationExitCode,
} from "./cli-runtime/index.js";

import { LearnMore, formatLearnMore, makeAxmFormatter } from "./formatter.js";
import { presentBuiltInOutput } from "./built-in-output.js";
import { withUpdateCheck, resolveNonInteractiveFromArgv } from "./update-check-startup.js";

import { axmGlobalFlags, baseLayer, startupUpdateCheckLayer } from "./runtime.js";
import { loadVersion } from "./version.js";
import { groupCapabilities, withCommandCapabilities } from "./root/shared/command-capabilities.js";
import { ScopedRoutesLive } from "./root/shared/scoped-command.js";

import { setupCommand } from "./root/setup.js";
import { instructionsCommand } from "./root/instructions.js";
import { agentsCommand } from "./root/agents/_agents.js";
import { extensionTypeCommands } from "./root/extension-type-commands.js";
import { loginCommand } from "./root/auth/login.js";
import { logoutCommand } from "./root/auth/logout.js";
import { whoamiCommand } from "./root/auth/whoami.js";
import { tokenCommand } from "./root/auth/token.js";
import { upgradeCommand } from "./root/upgrade/upgrade.js";
import { lintCommand } from "./root/lint/command.js";
import { discoverCommand } from "./root/discover/command.js";
import { installCommand } from "./root/install/command.js";
import { listCommand } from "./root/list/command.js";
import { uninstallCommand } from "./root/uninstall/command.js";
import { migrateCommand } from "./root/migrate/command.js";
import { syncCommand } from "./root/sync/command.js";
import { updateCommand } from "./root/update/command.js";
import { makeHelpCommand } from "./root/help/command.js";
import { viewCommand } from "./root/view/command.js";
import { versionCommand } from "./root/version/command.js";
import { publishCommand } from "./root/publish/command.js";
import { shareCommand } from "./root/share/command.js";
import { adoptCommand } from "./root/adopt/command.js";
import { demoteCommand } from "./root/demote/command.js";
import { forkCommand } from "./root/fork/command.js";
import { cacheCommand } from "./root/cache/command.js";
import { visibilityCommand } from "./root/visibility/command.js";
import {
  archiveCommand,
  deprecateCommand,
  unarchiveCommand,
  undeprecateCommand,
  unyankCommand,
  yankCommand,
} from "./root/lifecycle/command.js";

const ROOT_COMMAND = "axm";
const version = loadVersion();
type CommandProgramError = AppError | CliError.CliError | OutputWriteFailed;

const helpCommand = makeHelpCommand(() => rootCommand);

/**
 * Effect CLI built-ins kept for axm: `--completions` and `--log-level` are
 * intentionally absent — verbosity flags own logger severity instead.
 */
/**
 * Experimental AXM command tree for structural inspection and composition.
 *
 * Executing the tree through {@link run} is supported for one invocation per
 * process. Repeated, concurrent, and Worker-hosted invocation are unsupported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription(
    "Open extension manager for AI coding agents.\n  Manage skills, MCP servers, subagents, rules, hooks, knowledge, and packs across your AI coding agents from a single CLI.",
  ),
  withCommandCapabilities(groupCapabilities),
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
  Command.withSubcommands([
    {
      group: "GETTING STARTED",
      commands: [setupCommand, discoverCommand, helpCommand],
    },
    {
      group: "EXTENSION TYPES",
      commands: [...extensionTypeCommands],
    },
    {
      group: "MANAGE EXTENSIONS",
      commands: [
        installCommand,
        updateCommand,
        uninstallCommand,
        migrateCommand,
        listCommand,
        viewCommand,
      ],
    },
    {
      group: "AUTHOR EXTENSIONS",
      commands: [
        forkCommand,
        adoptCommand,
        demoteCommand,
        versionCommand,
        publishCommand,
        shareCommand,
      ],
    },
    {
      // `un*` rows fold into the command they reverse, so order is layout here:
      // each inverse directly follows its forward command.
      group: "PUBLISHED EXTENSIONS",
      commands: [
        visibilityCommand,
        yankCommand,
        unyankCommand,
        deprecateCommand,
        undeprecateCommand,
        archiveCommand,
        unarchiveCommand,
      ],
    },
    {
      group: "WORKSPACE",
      commands: [syncCommand, agentsCommand, instructionsCommand, lintCommand],
    },
    {
      group: "AUTH",
      commands: [loginCommand, logoutCommand, whoamiCommand, tokenCommand],
    },
    {
      group: "CLI",
      commands: [cacheCommand, upgradeCommand],
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

const usesRetiredAuthCommand = (args: ReadonlyArray<string>): boolean => args[0] === "auth";

/**
 * Raw credential output is decided before the parser runs, so nothing that
 * would share stdout with the credential — JSON, help, version, or a second
 * output mode — can reach the command.
 */
const rejectsTokenOutputAtStartup = (args: ReadonlyArray<string>): AppError | undefined => {
  const selectors = outputSelectorsFromArgv(args);
  if (!selectors.includes("token")) return undefined;
  const options = optionArgs(args);
  const detail =
    new Set(selectors).size > 1
      ? "--output accepts one value; choose token or human."
      : hasExplicitJsonFlag(args)
        ? "--output token and --json are mutually exclusive."
        : options.some((arg) => arg === "--help" || arg === "-h" || arg === "--version")
          ? "--output token cannot be combined with help or version output."
          : undefined;
  return detail === undefined ? undefined : makeAppError({ code: "usage", detail });
};

/**
 * One invocation of the command tree, with everything Effect CLI writes to its
 * console routed through the Screen. Built-in help and version output is
 * presented from the formatter's machine document, and the parser's own error
 * rendering is switched off because the application paints usage errors too.
 *
 * @internal Exported for the output specifications that drive a real invocation.
 */
export const runCommand = (argv: ReadonlyArray<string>, isJson: boolean) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const stdout: Array<string> = [];
    const stderr: Array<string> = [];
    const bufferedConsole: Console.Console = {
      ...globalThis.console,
      log: (...args: ReadonlyArray<unknown>) => void stdout.push(`${formatConsoleArgs(...args)}\n`),
      error: (...args: ReadonlyArray<unknown>) =>
        void stderr.push(`${formatConsoleArgs(...args)}\n`),
    };
    const exit = yield* Effect.exit(
      Command.runWith(rootCommand, { version, renderErrors: false })(argv).pipe(
        Effect.provideService(Console.Console, bufferedConsole),
      ),
    );
    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
    const helpRequest =
      failure !== undefined && CliError.isCliError(failure) && failure._tag === "ShowHelp"
        ? failure
        : undefined;

    yield* presentBuiltInOutput(stdout.join(""), {
      helpRequest,
      format: isJson ? "json" : "text",
    });
    if (stderr.length > 0) yield* screen.note([{ _tag: "raw", content: stderr.join("") }]);

    if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
    const exitCode = yield* getOperationExitCode;
    return processOutcome(Option.getOrElse(exitCode, () => 0));
  });

/**
 * Run AXM as a process entry point.
 *
 * This API supports one invocation per process. It owns stdout, stderr, and
 * signal handlers for that invocation, and it terminates the process on
 * failure. Repeated, concurrent, and Worker-hosted invocation are unsupported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) => {
      const isJson = resolveFormatFromArgv(argv) === "json";
      const startupRejection = rejectsTokenOutputAtStartup(argv);
      const commandProgram =
        startupRejection !== undefined
          ? Effect.fail<CommandProgramError>(startupRejection)
          : usesRetiredAuthCommand(argv)
            ? Effect.fail<CommandProgramError>(
                makeAppError({
                  code: "usage",
                  detail: "Unrecognized command: auth",
                }),
              )
            : argv.includes("-vv")
              ? Effect.fail<CommandProgramError>(
                  makeAppError({
                    code: "usage",
                    detail: "Unrecognized flag: -vv. Use --debug for full debug diagnostics.",
                  }),
                )
              : runCommand(argv, isJson).pipe(
                  Effect.mapError((error): CommandProgramError => error),
                );
      const outputPolicy = resolveCliOutputPolicy({
        quiet: resolveVerbosityFromArgv(argv) === "quiet",
        stderrIsTTY: stderrIsTTY(),
      });

      const rendererLayer = isJson
        ? MachineScreen({ quiet: outputPolicy.quiet })
        : InteractiveScreen({ outputPolicy });

      return withUpdateCheck(commandProgram, {
        localVersion: version,
        inputs: {
          args: argv,
          isNonInteractive: resolveNonInteractiveFromArgv(argv, {
            // eslint-disable-next-line no-restricted-properties -- Raw startup read before the configuration provider exists.
            ci: process.env["CI"],
            stdinIsTTY: process.stdin.isTTY,
          }),
          isJsonOutput: isJson,
          isStderrTTY: stderrIsTTY(),
        },
      }).pipe(
        // Built-in --help / --version output is formatter-driven: the formatter
        // emits machine documents, and the Screen selected above presents them,
        // deciding colour and width per stream.
        Effect.provide(
          Layer.mergeAll(
            baseLayer,
            startupUpdateCheckLayer,
            rendererLayer,
            CliOutput.layer(makeAxmFormatter()),
            // Recovery commands are addressed to the workspace scope only where
            // the registered route takes `--scope`; the tree says which do.
            ScopedRoutesLive(rootCommand),
          ),
        ),
        // An explicitly empty override remains distinct from an absent key.
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({ preserveEmptyStrings: true }),
        ),
      );
    },
    { args },
  );
};
