/**
 * List command handler - Effect-based orchestration for `axm skills list`.
 *
 * Reads the lockfile and displays installed skills, optionally filtered by agent.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../command-meta.js";
import { scopeFlag } from "../../cli-flags.js";
import { emitItemsResult } from "../../json-output.js";
import { withWorkspace } from "../../runtime.js";

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

const SkillListItemSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  agents: Schema.Array(Schema.String),
});

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

  const items = filtered.map(([name, entry]) => ({
    name,
    type: entry.type,
    agents: entry.agents,
  }));

  if (yield* emitItemsResult("skills.list", items, SkillListItemSchema)) {
    return;
  }

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
  scope: scopeFlag.pipe(
    Flag.withDescription("List skills from project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Show only skills installed for specific agent(s)"),
    Flag.atLeast(0),
  ),
} as const;
const commandMeta = registryCommandMeta("skills list", { json: true });

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  handleList({ agents: agent }).pipe(withWorkspace(scope), withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(listConfig),
  annotateCommandMeta(commandMeta),
  Command.withAlias("ls"),
  Command.withDescription("List installed skills"),
  Command.withExamples([
    { command: "axm skills list", description: "See what skills are installed" },
    {
      command: "axm skills list --scope user",
      description: "Check user-level skills",
    },
    {
      command: "axm skills list --agent claude-code",
      description: "See skills for a specific agent",
    },
    { command: "", description: "See also: skills install, skills update" },
  ]),
);
