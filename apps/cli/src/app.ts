import { booleanOptionFromArgv } from "./cli-flags/argv-boolean.js";
import type { ProcessFailure } from "./cli-runtime/process-outcome.js";
import {
  TerminalDiagnostics,
  TerminalDiagnosticsLive,
} from "./cli-runtime/terminal-diagnostics.js";
/**
 * Root CLI application.
 */

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Queue from "effect/Queue";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliConfig, CliError, CliOutput, Command, GlobalFlag } from "effect/cli";

import { AppError, makeAppError } from "./app-error/index.js";
import {
  InteractiveScreen,
  MachineScreen,
  type OutputWriteFailed,
  resolveCliOutputPolicy,
  stderrIsTTY,
} from "./screen/index.js";
import { axmGlobalFlags, resolveVerbosityFromArgv } from "./cli-flags/index.js";
import {
  hasExplicitJsonFlag,
  hasPlainFlag,
  resolveFormatFromArgv,
  runCliMain,
  processOutcome,
  getOperationExitCode,
  withProcessTelemetry,
} from "./cli-runtime/index.js";
import { TelemetryClientLive } from "./telemetry/index.js";

import { LearnMore, formatLearnMore } from "./formatter.js";
import { presentBuiltInOutput } from "./built-in-output.js";
import { withUpdateCheck, resolveNonInteractiveFromArgv } from "./update-check-startup.js";

import {
  PlatformLayer,
  baseLayer,
  resolveProcessTelemetryOptions,
  startupUpdateCheckLayer,
} from "./runtime.js";
import { loadVersion } from "./version.js";
import { validateCommandPath } from "./validate-command-path.js";
import { CommandRoute } from "./cli-runtime/command-route.js";
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
import { lockCommand } from "./root/lock/command.js";
import { rootEnableCommand, rootDisableCommand } from "./root/activation-handler.js";
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
import { diagnosticsCommand } from "./root/diagnostics/command.js";
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
      group: "START HERE",
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
        rootEnableCommand,
        rootDisableCommand,
        migrateCommand,
        listCommand,
        lockCommand,
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
      commands: [cacheCommand, diagnosticsCommand, upgradeCommand],
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
      ["https://github.com/agentxm/axm/issues/new/choose", "Report an issue"],
    ]),
  ),
);

const usesRetiredAuthCommand = (args: ReadonlyArray<string>): boolean => args[0] === "auth";

/**
 * Raw credential output is decided before the parser runs, so nothing that
 * would share stdout with the credential — JSON, help, or version output — can reach the command.
 */
const rejectsTokenOutputAtStartup = (args: ReadonlyArray<string>): AppError | undefined => {
  if (!hasPlainFlag(args)) return undefined;
  const detail = hasExplicitJsonFlag(args)
    ? "--plain and --json are mutually exclusive."
    : Option.getOrElse(booleanOptionFromArgv(args, ["--help", "-h"]), () => false) ||
        Option.getOrElse(booleanOptionFromArgv(args, ["--version"]), () => false)
      ? "--plain cannot be combined with help or version output."
      : undefined;
  return detail === undefined ? undefined : makeAppError({ code: "usage", detail });
};

/**
 * Route native CLI presenter events through Screen after parsing completes.
 * The process boundary owns usage errors and output-write failures.
 * @internal Exported for real-invocation output specifications.
 */
export const runCommand = (argv: ReadonlyArray<string>, isJson: boolean) =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<CliOutput.Presenter.Event>();
    const exit = yield* Effect.exit(
      validateCommandPath(rootCommand, argv).pipe(
        Effect.catchTag("ShowHelp", (error) =>
          Effect.gen(function* () {
            const { builtIns } = yield* CliConfig.CliConfig;
            yield* GlobalFlag.Help.run(true, {
              command: rootCommand,
              commandPath: error.commandPath,
              builtIns,
              version,
            });
            return yield* error;
          }),
        ),
        Effect.flatMap((route) =>
          Command.runWith(rootCommand, { version, renderErrors: false })(argv).pipe(
            Effect.provideService(CommandRoute, route),
          ),
        ),
        Effect.provideService(CliOutput.Presenter, {
          present: (event) => Queue.offer(events, event).pipe(Effect.asVoid),
        }),
      ),
    );
    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
    const helpRequest =
      failure !== undefined && CliError.isCliError(failure) && failure._tag === "ShowHelp"
        ? failure
        : undefined;

    for (const event of yield* Queue.takeAll(events)) {
      yield* presentBuiltInOutput(event, {
        helpRequest,
        format: isJson ? "json" : "text",
      });
    }

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
        Effect.provide(
          Layer.mergeAll(
            baseLayer,
            startupUpdateCheckLayer,
            rendererLayer,
            // Recovery commands are addressed to the workspace scope only where
            // the registered route takes `--scope`; the tree says which do.
            ScopedRoutesLive(rootCommand),
          ),
        ),
        // One reporter, on the plain AXM transport, serves the invocation.
        withProcessTelemetry(
          Layer.provide(
            TelemetryClientLive({
              ...resolveProcessTelemetryOptions(),
              previewFormat: isJson ? "json" : "text",
            }),
            PlatformLayer,
          ),
        ),
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          return Effect.gen(function* () {
            const diagnostics = yield* TerminalDiagnostics;
            const record = yield* diagnostics.current;
            return {
              _tag: "ProcessFailure",
              error: Cause.squash(cause),
              ...(Option.isSome(record)
                ? { diagnosticId: record.value.eventId, diagnostic: record.value.failure }
                : {}),
            } satisfies ProcessFailure;
          });
        }),
        Effect.provide(Layer.provide(TerminalDiagnosticsLive, PlatformLayer)),
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
