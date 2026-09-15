import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { WorkspaceRecordsService } from "./workspace-records.js";
import type { WorkspaceStateReadFailure } from "./contracts.js";

/**
 * Determine installation from the observable workspace inventory. Lock
 * presence is intentionally irrelevant.
 */
export const isObservedInstalled = (
  records: WorkspaceRecordsService,
  type: InstallableExtensionType,
  name: string,
): Effect.Effect<boolean, WorkspaceStateReadFailure, FileSystem.FileSystem | Path.Path> =>
  records
    .getExtensionInventory(type, {})
    .pipe(
      Effect.map((inventory) =>
        inventory.items.some((item) => item.name === name && item.installed),
      ),
    );
