import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { Command, Flag } from "effect/cli";

import { makeAppError } from "../../app-error/index.js";
import { Screen } from "../../screen/index.js";
import { observeUnit } from "@agentxm/workspace-kernel/operations";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  ExtensionListDocumentSchema,
  ListExtensions,
  type ExtensionListDocument,
} from "@agentxm/workspace-features/inspection";
import { WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";

import { inspectionFailureToAppError } from "../../feature-errors.js";
import { listDoc } from "./view.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export interface ListHandlerArgs {
  readonly types: ReadonlyArray<InstallableExtensionType>;
  readonly outdated: boolean;
  readonly deprecated: boolean;
}

/** Where an empty unfiltered inventory stands: no workspace, or one with nothing installed. */
const emptyInventory = Effect.fn("List.emptyInventory")(function* () {
  const location = yield* WorkspaceLocation;
  const fs = yield* FileSystem.FileSystem;
  if (location.scope === "user") return "empty-user" as const;
  const initialized = yield* fs.exists(location.settingsPath).pipe(
    // An unreadable settings path is not a workspace this command can list.
    Effect.orElseSucceed(() => false),
  );
  return initialized ? ("empty-project" as const) : ("no-workspace" as const);
});

export const handleList = Effect.fn("List.handle")(function* (args: ListHandlerArgs) {
  if (args.outdated && args.deprecated) {
    return yield* makeAppError({
      code: "usage",
      detail: "--outdated and --deprecated cannot be combined",
    });
  }
  const screen = yield* Screen;
  const filter = args.outdated ? "outdated" : args.deprecated ? "deprecated" : "all";
  const result = yield* withLiveOperation(
    { command: "list", name: "List extensions", mode: "query" },
    observeUnit(
      {
        id: filter === "all" ? "inventory" : "assessment",
        label:
          filter === "all"
            ? "inventory"
            : `${filter === "outdated" ? "update" : "deprecation"} status`,
      },
      ListExtensions.query({
        types: args.types,
        filter,
      }).pipe(Effect.mapError(inspectionFailureToAppError)),
    ),
  );
  const document: ExtensionListDocument = result.document;
  if (yield* screen.document(document, ExtensionListDocumentSchema)) return;
  const coverage = document.coverage;
  const emptyState =
    result.items.length === 0 && filter === "all" ? yield* emptyInventory() : undefined;
  yield* screen.result(
    listDoc({
      items: result.items,
      filter,
      ...(coverage === undefined ? {} : { coverage }),
      ...(emptyState === undefined ? {} : { emptyState }),
    }),
  );
});

const listConfig = {
  scope: scopeFlag,
  type: Flag.Literals("type", [...installableExtensionTypes]).pipe(
    withParameterDescription("Restrict to this extension type"),
    Flag.atLeast(0),
  ),
  outdated: Flag.Boolean("outdated").pipe(
    withParameterDescription("Only list installed extensions with available updates"),
    withParameterDefault(false),
  ),
  deprecated: Flag.Boolean("deprecated").pipe(
    withParameterDescription("Only list installed extensions deprecated by their registry"),
    withParameterDefault(false),
  ),
} as const;

export const listCommand = Command.make(
  "list",
  listConfig,
  ({ scope, type, outdated, deprecated }) =>
    handleList({ types: type, outdated, deprecated }).pipe(
      withWorkspace({ scope, allowUninitialized: true }),
      withRuntime("list"),
    ),
).pipe(
  withArgvTracking(listConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List extensions across all types"),
  Command.withShortDescription("List installed extensions"),
  Command.withExamples([
    { command: "axm list", description: "List the local project inventory" },
    { command: "axm list --type skill", description: "List only skills" },
    { command: "axm list --outdated", description: "Check installed extensions for updates" },
    { command: "axm list --deprecated", description: "Check for deprecated extensions" },
    { command: "axm list --scope user", description: "List user-level extensions" },
  ]),
);
