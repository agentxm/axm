/**
 * List handler - Effect-based orchestration for `axm subagents list`.
 *
 * Reads installed subagents (configured + implicit/transitive) and displays them.
 * Direct settings entries take precedence over pack-provided (transitive) entries.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { emitItemsResult } from "../../../json-output.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the list handler.
 */
export interface ListSubagentsHandlerArgs {
  /** Agent names to filter by (empty = show all) */
  readonly agents: readonly string[];
}

const SubagentListItemSchema = Schema.Struct({
  name: Schema.String,
  lifecycle: Schema.String,
  enabled: Schema.Boolean,
});

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm subagents list` command.
 *
 * Flow:
 * 1. Read installed subagents (configured + implicit from packs)
 * 2. Display results or "No subagents installed"
 *
 * Direct settings entries take precedence over pack-provided (transitive)
 * entries because the classifier assigns them `lifecycle: "configured"`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleListSubagents = Effect.fn("ListSubagents.handle")(function* (
  _args: ListSubagentsHandlerArgs,
) {
  const renderer = yield* CliRenderer;
  const ws = yield* Workspace;

  // getInstalledSubagents returns configured (direct) + implicit (transitive/pack-provided).
  const subagents = yield* ws.getInstalledSubagents();
  const entries = Object.entries(subagents);

  const items = entries.map(([name, entry]) => ({
    name,
    lifecycle: entry.lifecycle,
    enabled: entry.enabled,
  }));

  if (yield* emitItemsResult("subagents.list", items, SubagentListItemSchema)) {
    return;
  }

  if (entries.length === 0) {
    yield* renderer.info("No subagents installed");
    return;
  }

  // Display each subagent
  yield* Effect.forEach(
    entries,
    ([name, entry]) => {
      const status = entry.enabled ? "" : " (disabled)";
      const source = entry.lifecycle === "implicit" ? "  [pack]" : "";
      return renderer.message(`${name}  (${entry.lifecycle})${source}${status}`);
    },
    { discard: true },
  );
});
