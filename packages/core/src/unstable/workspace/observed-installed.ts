import * as Effect from "effect/Effect";
import type { AppError } from "../app-error/index.js";
import type { InstallableExtensionType } from "../extensions/index.js";
import type { WorkspaceMutationsService } from "./service-interface.js";

/**
 * Determine installation from the observable workspace inventory. Receipt
 * presence is intentionally irrelevant.
 */
export const isObservedInstalled = (
  workspace: WorkspaceMutationsService,
  type: InstallableExtensionType,
  name: string,
): Effect.Effect<boolean, AppError> =>
  workspace.records
    .getExtensionInventory(type, { includeIgnored: false })
    .pipe(
      Effect.map((inventory) =>
        inventory.items.some(
          (item) =>
            item.name === name && item.classification.kind === "lifecycle" && item.installed,
        ),
      ),
    );
