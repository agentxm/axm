import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleSync } from "./handler.js";

const syncConfig = {
  target: Argument.string("extension").pipe(
    Argument.withDescription("Optional extension or pack root to reconcile"),
    Argument.optional,
  ),
  // Pack is a container, not a directly materialized extension. Explicit pack
  // roots expand to their member closure; type-filtered sync dispatches only
  // the non-container types derived from the canonical capability table.
  type: Flag.choice("type", [...CATALOG_EXTENSION_TYPES]).pipe(
    Flag.withDescription("Reconcile only one directly materialized extension type"),
    Flag.optional,
  ),
  scope: scopeFlag.pipe(Flag.withDescription("Sync project (default) or user-level configuration")),
  preview: Flag.boolean("preview").pipe(
    Flag.withDescription("Preview the materialization plan without applying it"),
    Flag.withDefault(false),
  ),
  failOnChange: Flag.boolean("fail-on-change").pipe(
    Flag.withDescription("Exit 1 when preview finds reconciliation work"),
    Flag.withDefault(false),
  ),
  ignoreReleaseAge: Flag.boolean("ignore-release-age").pipe(
    Flag.withDescription(
      "Allow configured Registry releases newer than minimumReleaseAge for this sync",
    ),
    Flag.withDefault(false),
  ),
} as const;

export const syncCommand = Command.make(
  "sync",
  syncConfig,
  ({ target, type, scope, preview, failOnChange, ignoreReleaseAge }) =>
    handleSync({ target, type, preview, failOnChange, ignoreReleaseAge }).pipe(
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
      command: "axm sync --preview --fail-on-change",
      description: "Fail CI when reconciliation would change managed state",
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
