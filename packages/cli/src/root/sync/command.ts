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
  preview: Flag.boolean("preview").pipe(
    Flag.withDescription("Preview the materialization plan without applying it"),
  ),
  ignoreReleaseAge: Flag.boolean("ignore-release-age").pipe(
    Flag.withDescription(
      "Allow configured Registry releases newer than minimumReleaseAge for this sync",
    ),
  ),
} as const;

export const syncCommand = Command.make(
  "sync",
  syncConfig,
  ({ target, type, scope, preview, ignoreReleaseAge }) =>
    handleSync({ target, type, preview, ignoreReleaseAge }).pipe(
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
      command: "axm sync --preview",
      description: "Preview what would be materialized without writing files",
    },
    {
      command: "axm sync @acme/packs/frontend-tools --preview",
      description: "Preview reconciliation for one pack and its members",
    },
    {
      command: "axm sync --type skill",
      description: "Reconcile only configured skills",
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
