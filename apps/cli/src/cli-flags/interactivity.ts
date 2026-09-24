/**
 * Effective prompt availability.
 *
 * A prompt may open only when the invocation is interactive — the explicit
 * `--non-interactive` flag wins over `CI` and stdin detection in both
 * directions — and machine output is off. Machine output is an absolute
 * prohibition: a JSON invocation never prompts even from a terminal or with
 * an explicit interaction flag. The Screen combines this resolution with its
 * frame's ability to paint a prompt into `Screen.canAsk`, the one decision
 * planning, command handlers, and the screen itself read.
 */

import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as Option from "effect/Option";

import { envOption } from "../utils/environment.js";
import { jsonFlag } from "./json-flag.js";
import { isNonInteractiveOptional } from "./non-interactive.js";

export const isMachineOutput: Effect.Effect<boolean> = Effect.map(
  Effect.serviceOption(jsonFlag),
  (json) => Option.exists(Option.flatten(json), Boolean),
);

/** Whether the invocation's flags and environment allow a prompt to open. */
export const promptAvailability: Effect.Effect<boolean, Config.ConfigError> = Effect.gen(
  function* () {
    const machine = yield* isMachineOutput;
    if (machine) return false;
    return !(yield* isNonInteractiveOptional);
  },
);

/** Variables a coding agent sets in the sessions it drives. */
const AGENT_ENV_KEYS = ["CLAUDECODE", "GEMINI_CLI", "CURSOR_AGENT"] as const;

/** Whether a coding agent, rather than a person, is driving this invocation. */
export const isAgentSession: Effect.Effect<boolean, Config.ConfigError> = Effect.map(
  Effect.forEach(AGENT_ENV_KEYS, envOption),
  (values) => values.some((value) => Option.exists(value, (raw) => raw.length > 0)),
);
