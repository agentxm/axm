/**
 * List command handler - Effect-based orchestration for `axm commands list`.
 *
 * Reads the workspace service and displays installed commands with lifecycle info.
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
export interface ListCommandsHandlerArgs {
  /** Agent names to filter by (empty = show all) */
  readonly agents: ReadonlyArray<string>;
}

const CommandListItemSchema = Schema.Struct({
  name: Schema.String,
  source: Schema.String,
  enabled: Schema.Boolean,
  lifecycle: Schema.String,
});

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm commands list` command.
 *
 * Flow:
 * 1. Read classified commands map
 * 2. Display results or "No commands installed"
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleListCommands = Effect.fn("ListCommands.handle")(function* (
  _args: ListCommandsHandlerArgs,
) {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;
  const commands = yield* ws.getClassifiedCommands();

  const entries = Object.entries(commands);

  const items = entries.map(([name, entry]) => ({
    name,
    source: typeof entry.source === "string" ? entry.source : "",
    enabled: entry.enabled,
    lifecycle: entry.lifecycle,
  }));

  if (yield* emitItemsResult("commands.list", items, CommandListItemSchema)) {
    return;
  }

  if (entries.length === 0) {
    yield* renderer.info("No commands installed");
    return;
  }

  // Display each command
  yield* Effect.forEach(
    entries,
    ([name, entry]) => {
      const source = typeof entry.source === "string" ? entry.source : "";
      const status = entry.enabled ? "enabled" : "disabled";
      return renderer.message(`${name}  (${entry.lifecycle})  [${status}]  ${source}`);
    },
    { discard: true },
  );
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List commands from project (default) or user-level configuration"),
  ),
} as const;
const commandMeta = registryCommandMeta("commands list", { json: true });

export const listCommand = Command.make("list", listConfig, ({ scope }) =>
  handleListCommands({ agents: [] }).pipe(withWorkspace(scope), withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(listConfig),
  annotateCommandMeta(commandMeta),
  Command.withAlias("ls"),
  Command.withDescription("List installed commands"),
  Command.withExamples([
    { command: "axm commands list", description: "See what commands are installed" },
    {
      command: "axm commands list --scope user",
      description: "Check user-level commands",
    },
    { command: "", description: "See also: commands install, commands update" },
  ]),
);
