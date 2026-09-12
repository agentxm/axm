/**
 * Startup update check integration.
 *
 * The check itself — suppression, the cached channel document, the
 * notification a fresh cache justifies, and the bounded background
 * revalidation — belongs to `@agentxm/cli-maintenance`. This module supplies the
 * two things only the application knows: the runtime signals the skip context
 * is derived from (raw argv, output mode, TTY, agent session) and the surface
 * the notification is printed on.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  checkStartupUpdate,
  type StableChannelCheck,
  type UpdateCheckCache,
} from "@agentxm/cli-maintenance/self-update/application";
import type { AvailableUpdate } from "@agentxm/cli-maintenance/self-update/domain";

import { Screen, calloutDoc } from "./screen/index.js";
import { isAgent } from "./interaction.js";

// -----------------------------------------------------------------------------
// Skip detection from argv
// -----------------------------------------------------------------------------

/**
 * Detect whether the command being run is `axm upgrade` from raw argv.
 */
export const isUpgradeCommand = (args: ReadonlyArray<string>): boolean => {
  const terminatorIndex = args.indexOf("--");
  const commandTokens = args.slice(0, terminatorIndex === -1 ? args.length : terminatorIndex);
  return commandTokens.includes("upgrade");
};

/**
 * Detect non-interactive mode from raw argv and environment.
 */
export const resolveNonInteractiveFromArgv = (args: ReadonlyArray<string>): boolean =>
  args.includes("--non-interactive") ||
  // eslint-disable-next-line no-restricted-properties -- Centralized env var access for CI detection
  process.env["CI"] === "true" ||
  process.stdin.isTTY !== true;

export interface UpdateCheckContextInputs {
  readonly args: ReadonlyArray<string>;
  readonly isNonInteractive: boolean;
  readonly isJsonOutput: boolean;
  /** Stderr TTY detection captured by the screen boundary. */
  readonly isStderrTTY?: boolean | undefined;
  /** State `AXM_NO_UPDATE_CHECK` instead of reading it from configuration. */
  readonly noUpdateCheckEnv?: boolean | undefined;
  /** Override agent-session detection. Defaults to `isAgent(process.env)`. */
  readonly isAgentSession?: boolean | undefined;
}

const skipContext = (inputs: UpdateCheckContextInputs) => ({
  isJsonOutput: inputs.isJsonOutput,
  isUpgradeCommand: isUpgradeCommand(inputs.args),
  isNonInteractive: inputs.isNonInteractive,
  isStderrTTY: inputs.isStderrTTY ?? false,
  // eslint-disable-next-line no-restricted-properties -- Centralized env var access for agent-session detection
  isAgentSession: inputs.isAgentSession ?? isAgent(process.env),
  ...(inputs.noUpdateCheckEnv === undefined ? {} : { noUpdateCheckEnv: inputs.noUpdateCheckEnv }),
});

const noUpdateCheckEnvironment = Config.option(Config.String("AXM_NO_UPDATE_CHECK")).pipe(
  Effect.map((value) => Option.getOrUndefined(value) === "1"),
  // Configuration failure suppresses this optional check; it cannot fail the command.
  Effect.catch(() => Effect.succeed(true)),
);

// -----------------------------------------------------------------------------
// Notification printing
// -----------------------------------------------------------------------------

export type NotificationPrinter = (message: string) => Effect.Effect<void>;

export const notificationMessage = (
  update: AvailableUpdate,
  audience: "human" | "agent",
): string =>
  audience === "agent"
    ? `AXM_UPDATE_AVAILABLE current=${update.current} latest=${update.latest} command="axm upgrade"`
    : `Update available: ${update.current} → ${update.latest}\nRun: axm upgrade`;

const UPDATE_AVAILABLE_PREFIX = "Update available: ";
const UPDATE_AVAILABLE_TITLE = "Update Available";

const toHumanUpdateNote = (
  message: string,
): { readonly message: string; readonly title: string } => {
  const [firstLine, ...rest] = message.split("\n");
  const headline = firstLine?.startsWith(UPDATE_AVAILABLE_PREFIX)
    ? firstLine.slice(UPDATE_AVAILABLE_PREFIX.length)
    : (firstLine ?? message);
  const body = rest.length > 0 ? [headline, ...rest].join("\n") : headline;

  return { message: body, title: UPDATE_AVAILABLE_TITLE };
};

/**
 * Wrap a command program with the startup update check: run the check, print
 * the notification it justified before the command writes anything, then run
 * the command.
 */
export const withUpdateCheck = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  options: {
    readonly localVersion: string;
    readonly inputs: UpdateCheckContextInputs;
    readonly printNotification?: NotificationPrinter | undefined;
  },
): Effect.Effect<A, E, R | UpdateCheckCache | StableChannelCheck | Screen> =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = skipContext(options.inputs);
      const outcome = yield* checkStartupUpdate({
        localVersion: options.localVersion,
        context: {
          ...context,
          noUpdateCheckEnv: context.noUpdateCheckEnv ?? (yield* noUpdateCheckEnvironment),
        },
      });
      if (outcome._tag === "Skipped" || Option.isNone(outcome.notification)) {
        return yield* program;
      }

      const notification = outcome.notification.value;
      const audience = context.isAgentSession ? "agent" : "human";
      const screen = yield* Screen;
      const print =
        options.printNotification ??
        (audience === "agent"
          ? (message: string) => screen.note([{ _tag: "paragraph", text: message }])
          : (message: string) => {
              const note = toHumanUpdateNote(message);
              return screen.note(calloutDoc(note.message, note.title));
            });

      yield* print(notificationMessage(notification, audience));
      return yield* program;
    }),
  );
