import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleSync } from "./handler.js";

const syncConfig = {
  target: Argument.string("fqn").pipe(
    Argument.withDescription("Optional extension or pack root to reconcile"),
    Argument.optional,
  ),
  type: Flag.choice("type", [
    "skill",
    "mcp-server",
    "subagent",
    "rule",
    "hook",
    "knowledge",
  ] as const).pipe(Flag.withDescription("Reconcile only one extension type"), Flag.optional),
  scope: scopeFlag.pipe(Flag.withDescription("Sync project (default) or user-level configuration")),
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Preview the materialization plan without applying it"),
  ),
  force: Flag.boolean("force").pipe(
    Flag.withDescription("Overwrite drifted managed MCP server agent configs"),
  ),
  acceptAuthorityChange: Flag.boolean("accept-authority-change").pipe(
    Flag.withDescription("Re-anchor one relocated workspace-authored extension"),
  ),
} as const;

export const syncCommand = Command.make(
  "sync",
  syncConfig,
  ({ target, type, scope, dryRun, force, acceptAuthorityChange }) =>
    handleSync({ target, type, dryRun, force, acceptAuthorityChange }).pipe(
      withWorkspace(scope),
      withRuntime("sync"),
    ),
).pipe(
  withArgvTracking(syncConfig),
  Command.withDescription("Materialize configured workspace files"),
  Command.withExamples([
    {
      command: "axm sync",
      description: "Rebuild managed workspace files",
    },
    {
      command: "axm sync --dry-run",
      description: "Preview what would be materialized without writing files",
    },
    {
      command: "axm sync @acme/packs/frontend-tools --dry-run",
      description: "Preview reconciliation for one pack and its members",
    },
    {
      command: "axm sync --type skill",
      description: "Reconcile only configured skills",
    },
    {
      command: "axm sync --force",
      description: "Overwrite drifted managed MCP server agent configs",
    },
    {
      command: "axm sync @acme/mcps/context --accept-authority-change",
      description: "Re-anchor a relocated workspace-authored extension",
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
