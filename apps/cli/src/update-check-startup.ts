import type { OutputWriteFailed } from "./screen/streams.js";
/**
 * Startup update check integration.
 *
 * The check itself — suppression, the cached latest release, the
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
  type LatestReleaseCheck,
  type UpdateCheckCache,
} from "@agentxm/cli-maintenance/self-update/application";
import type { AvailableUpdate } from "@agentxm/cli-maintenance/self-update/domain";

import { isAgentSession } from "./cli-flags/index.js";
import { Screen } from "./screen/index.js";
import { ciEnabled } from "./utils/environment.js";

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
 * Detect non-interactive mode from raw argv and environment. This runs before
 * Effect CLI parses flags, so the flag is read from raw argv; CI is read with
 * the same predicate every other CI decision applies.
 */
export const resolveNonInteractiveFromArgv = (
  args: ReadonlyArray<string>,
  environment: { readonly ci: string | undefined; readonly stdinIsTTY: boolean | undefined },
): boolean =>
  args.includes("--non-interactive") ||
  ciEnabled(environment.ci) ||
  environment.stdinIsTTY !== true;

export interface UpdateCheckContextInputs {
  readonly args: ReadonlyArray<string>;
  readonly isNonInteractive: boolean;
  readonly isJsonOutput: boolean;
  /** Stderr TTY detection captured by the screen boundary. */
  readonly isStderrTTY?: boolean | undefined;
  /** State `AXM_NO_UPDATE_CHECK` instead of reading it from configuration. */
  readonly noUpdateCheckEnv?: boolean | undefined;
  /** State agent-session detection instead of reading it from configuration. */
  readonly isAgentSession?: boolean | undefined;
}

/**
 * The environment signals the skip context reads from configuration. A
 * configuration failure suppresses this optional check; it cannot fail the
 * command.
 */
const environmentSignals = Effect.all({
  noUpdateCheckEnv: Effect.map(
    Config.option(Config.String("AXM_NO_UPDATE_CHECK")),
    (value) => Option.getOrUndefined(value) === "1",
  ),
  isAgentSession,
}).pipe(Effect.catch(() => Effect.succeed({ noUpdateCheckEnv: true, isAgentSession: false })));

const skipContext = (inputs: UpdateCheckContextInputs) =>
  Effect.map(environmentSignals, (signals) => ({
    isJsonOutput: inputs.isJsonOutput,
    isUpgradeCommand: isUpgradeCommand(inputs.args),
    isNonInteractive: inputs.isNonInteractive,
    isStderrTTY: inputs.isStderrTTY ?? false,
    isAgentSession: inputs.isAgentSession ?? signals.isAgentSession,
    noUpdateCheckEnv: inputs.noUpdateCheckEnv ?? signals.noUpdateCheckEnv,
  }));

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
    : `axm ${update.latest} is available (you have ${update.current}), run axm upgrade`;

/**
 * Wrap a command program with the startup update check. An agent session is
 * told before the command writes anything, in one machine-readable line; a
 * person is told after the command's result, in one dim line that never
 * interrupts it.
 */
export const withUpdateCheck = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  options: {
    readonly localVersion: string;
    readonly inputs: UpdateCheckContextInputs;
    readonly printNotification?: NotificationPrinter | undefined;
  },
): Effect.Effect<A, E | OutputWriteFailed, R | UpdateCheckCache | LatestReleaseCheck | Screen> =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* skipContext(options.inputs);
      const outcome = yield* checkStartupUpdate({
        localVersion: options.localVersion,
        context,
      });
      if (outcome._tag === "Skipped" || Option.isNone(outcome.notification)) {
        return yield* program;
      }

      const notification = outcome.notification.value;
      const audience = context.isAgentSession ? "agent" : "human";
      const screen = yield* Screen;
      const print =
        options.printNotification ??
        ((message: string) =>
          screen.note([
            {
              _tag: "paragraph",
              text: message,
              ...(audience === "human" ? { tone: "dim" } : {}),
            },
          ]));
      const printed = print(notificationMessage(notification, audience));

      if (audience === "agent") {
        yield* printed;
        return yield* program;
      }
      const result = yield* program;
      yield* printed;
      return result;
    }),
  );
