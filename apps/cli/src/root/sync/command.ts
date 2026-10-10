import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import { Argument, Command, Flag } from "effect/cli";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { ignoreReleaseAgeFlag } from "../../cli-flags/index.js";
import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { handleSync } from "./handler.js";

const syncConfig = {
  target: Argument.String("extension").pipe(
    withParameterDescription("Optional extension or pack root to reconcile"),
    Argument.optional,
  ),
  // Pack is a container, not a directly materialized extension. Explicit pack
  // roots expand to their member closure; type-filtered sync dispatches only
  // the non-container types derived from the canonical capability table.
  type: Flag.Literals("type", [...CATALOG_EXTENSION_TYPES]).pipe(
    withParameterDescription("Restrict to this extension type"),
    Flag.atLeast(0),
  ),
  scope: scopeFlag,
  preview: previewCapabilityFlag(),
  failOnChange: Flag.Boolean("fail-on-change").pipe(
    withParameterDescription("Exit 1 when preview finds reconciliation work"),
    withParameterDefault(false),
  ),
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const syncCommand = Command.make(
  "sync",
  syncConfig,
  ({ target, type, scope, preview, failOnChange, ignoreReleaseAge }) =>
    handleSync({ target, types: type, preview, failOnChange }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("sync"),
    ),
).pipe(
  withArgvTracking(syncConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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
