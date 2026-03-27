/**
 * List command handler - Effect-based orchestration for `axm skills list`.
 *
 * Reads the lockfile and displays installed skills, optionally filtered by agent.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";

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
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const skills = yield* ws.getLockedSkills();

  // Filter by agents if specified
  const entries = Object.entries(skills);
  const filtered =
    args.agents.length > 0
      ? entries.filter(([, entry]) => args.agents.some((agent) => entry.agents.includes(agent)))
      : entries;

  if (filtered.length === 0) {
    yield* renderer.info("No skills installed");
    return;
  }

  // Display each skill
  yield* Effect.forEach(
    filtered,
    ([name, entry]) => {
      const agents = entry.agents.length > 0 ? entry.agents.join(", ") : "none";
      return renderer.message(`${name}  (${entry.type})  [${agents}]`);
    },
    { discard: true },
  );
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const listConfig = {
  scope: scopeFlag,
  agent: Flag.string("agent").pipe(Flag.withDescription("Filter by agent(s)"), Flag.atLeast(0)),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  withRuntime(withWorkspace(scope, handleList({ agents: agent })), { command: "skills list" }),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed skills"),
  Command.withExamples([
    { command: "axm skills list", description: "List all installed skills" },
    {
      command: "axm skills list --scope user",
      description: "List user-scope installed skills",
    },
    {
      command: "axm skills list --agent claude-code",
      description: "List skills for a specific agent",
    },
  ]),
);
