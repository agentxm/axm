/**
 * List command handler - Effect-based orchestration for `axm skills list`.
 *
 * Reads the lockfile and displays installed skills, optionally filtered by agent.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { Log } from "../../../tui/index.js";
import { LockfileService } from "../../../lockfile/index.js";

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
export const handleList = (args: ListHandlerArgs) =>
  Effect.gen(function* () {
    const log = yield* Log;
    const ls = yield* LockfileService;
    const skills = yield* ls.getSkills();

    // Filter by agents if specified
    const entries = Object.entries(skills);
    const filtered =
      args.agents.length > 0
        ? entries.filter(([, entry]) => args.agents.some((agent) => entry.agents.includes(agent)))
        : entries;

    if (filtered.length === 0) {
      yield* log.info("No skills installed");
      return;
    }

    // Display each skill
    for (const [name, entry] of filtered) {
      const agents = entry.agents.length > 0 ? entry.agents.join(", ") : "none";
      yield* log.message(`${name}  (${entry.source})  [${agents}]`);
    }
  });
