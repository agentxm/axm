import { Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleSync } from "./handler.js";

const syncConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Sync project (default) or user-level configuration")),
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Preview the materialization plan without applying it"),
  ),
  force: Flag.boolean("force").pipe(
    Flag.withDescription("Overwrite drifted managed MCP server agent configs"),
  ),
} as const;

export const syncCommand = Command.make("sync", syncConfig, ({ scope, dryRun, force }) =>
  handleSync({ dryRun, force }).pipe(withWorkspace(scope), withRuntime("sync")),
).pipe(
  withArgvTracking(syncConfig),
  Command.withDescription("Materialize workspace files from the axm lockfile"),
  Command.withExamples([
    {
      command: "axm sync",
      description: "Rebuild managed workspace files from .axm/axm-lock.yaml",
    },
    {
      command: "axm sync --dry-run",
      description: "Preview what would be materialized without writing files",
    },
    {
      command: "axm sync --force",
      description: "Overwrite drifted managed MCP server agent configs",
    },
    {
      command: "axm sync --scope user",
      description: "Sync the user-scope workspace",
    },
    {
      command: "axm sync --json",
      description: "Emit the sync result as JSON",
    },
  ]),
);
