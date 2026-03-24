/**
 * List command handler - Effect-based orchestration for `axm skills list`.
 *
 * Reads the lockfile and displays installed skills, optionally filtered by agent.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { Output } from "../../../output/index.js";
import { TelemetryClient } from "../../../telemetry/index.js";
import { Workspace } from "../../../workspace/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the list handler.
 */
export interface ListHandlerArgs {
  /** Agent names to filter by (empty = show all) */
  readonly agents: readonly string[];
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills list` command.
 *
 * Flow:
 * 1. Read lockfile skills map
 * 2. Filter by agents if specified (OR logic)
 * 3. Display results or "No skills installed"
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  const tc = yield* TelemetryClient;
  yield* tc.trackEvent("command_invoked", { command: "skills list" });
  const output = yield* Output;
  const ws = yield* Workspace;
  const skills = yield* ws.getLockedSkills();

  // Filter by agents if specified
  const entries = Object.entries(skills);
  const filtered =
    args.agents.length > 0
      ? entries.filter(([, entry]) => args.agents.some((agent) => entry.agents.includes(agent)))
      : entries;

  if (filtered.length === 0) {
    yield* output.info("No skills installed");
    return;
  }

  // Display each skill
  yield* Effect.forEach(
    filtered,
    ([name, entry]) => {
      const agents = entry.agents.length > 0 ? entry.agents.join(", ") : "none";
      return output.message(`${name}  (${entry.type})  [${agents}]`);
    },
    { discard: true },
  );
});
