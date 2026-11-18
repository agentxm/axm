/**
 * Remove-from-pack operation — applies a precomputed manifest-remove delta to a pack manifest.
 *
 * Validates manifest precondition (stale check) before writing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { authoringStepFailure } from "../step-failure.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import type { OperationHandler } from "@agentxm/workspace-kernel/planning";
import type { Operation, JobStepResult } from "@agentxm/workspace-kernel/operations";
import { SettingsReader, WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "@agentxm/workspace-kernel/settlement";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  PackManifestSchema,
  type PackManifest,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { packManifestArtifact } from "./artifact.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { authoringRefused } from "../errors.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the remove-from-pack operation.
 */
interface RemoveFromPackOperationArgs {
  /** Pack name (without owner). */
  readonly packName: string;
  /** Pack owner (e.g., "@myorg"). */
  readonly packOwner: Handle;
  /** Precomputed manifest delta: extension names to remove. */
  readonly removals: ReadonlyArray<string>;
  /**
   * The manifest as the plan read it: its exact text, compared with the text
   * read under the workspace lock, and its decoded value, from which the
   * updated manifest is derived without being modified.
   */
  readonly prepared: {
    readonly text: string;
    readonly manifest: PackManifest;
  };
}

/**
 * Remove extensions from a pack manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RemoveFromPackOperation = Operation<"remove-from-pack", RemoveFromPackOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Remove-from-pack operation handler.
 *
 * 1. Short-circuit if removals list is empty (no-op)
 * 2. Read current manifest under the workspace lock
 * 3. Compare it with the prepared text (stale check)
 * 4. Apply removals to manifest
 * 5. Write updated manifest
 */
export const removeFromPack: OperationHandler<
  RemoveFromPackOperation,
  FileSystem.FileSystem | Path.Path | SettingsReader | WorkspaceLocation | WorkspaceTransactionScope
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    if (layout.scope !== "project") {
      return yield* authoringRefused({
        category: "validation",
        detail: "Authored packs can only be edited in a project workspace",
      });
    }
    const { packName, packOwner, removals, prepared } = op.args;
    const configured = (yield* (yield* SettingsReader).entries("pack"))[packName];
    if (configured === undefined || !isWorkspaceSourceLocator(configured.source)) {
      return yield* authoringRefused({
        category: "conflict",
        detail: `Pack "${packName}" is not an authored workspace pack`,
        recover: "Only workspace-authored packs can be edited in place.",
      });
    }
    // 1. Short-circuit if nothing to remove
    if (removals.length === 0) {
      return { result: "success", message: "No pack entries removed" } satisfies JobStepResult;
    }

    // 2. Read current manifest
    const manifestPath = path.join(
      layout.authoredRoot("pack"),
      packName,
      manifestFilenameForType("pack"),
    );
    yield* runWorkspaceTransaction({
      targets: [manifestPath],
      transition: Effect.gen(function* () {
        const manifestContent = yield* fs.readFileString(manifestPath).pipe(
          Effect.mapError((e) =>
            authoringRefused({
              category: "not_found",
              detail: `Pack manifest not found at ${manifestPath}`,
              suggestions: [{ description: "Ensure the pack exists on disk" }],
              cause: e,
            }),
          ),
        );

        // 3. Stale-check: the locked text must be the text the plan decided on.
        if (manifestContent !== prepared.text) {
          return yield* authoringRefused({
            category: "conflict",
            detail: `Pack manifest is stale — it was modified since the plan was created`,
            suggestions: [{ description: "Re-run the command to create a fresh plan" }],
          });
        }

        // 4. Apply removals to a copy of the prepared manifest
        const manifest = prepared.manifest;
        const removalSet = new Set(removals);
        const dependencies = Object.fromEntries(
          Object.entries(manifest.dependencies).filter(([name]) => !removalSet.has(name)),
        );
        const updatedManifest = {
          ...manifest,
          owner: manifest.owner,
          type: manifest.type,
          name: manifest.name,
          version: manifest.version,
          dependencies,
        };
        const validatedUpdatedManifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(
          updatedManifest,
        ).pipe(
          Effect.mapError((cause) =>
            authoringRefused({
              category: "validation",
              detail: `Updated pack manifest is invalid: ${manifestPath}`,
              cause,
            }),
          ),
        );

        // 5. Write updated manifest
        yield* fs
          .writeFileString(manifestPath, JSON.stringify(validatedUpdatedManifest, null, 2) + "\n")
          .pipe(
            Effect.mapError((e) =>
              authoringRefused({
                category: "internal",
                detail: `Failed to write pack manifest: ${manifestPath}`,
                cause: e,
              }),
            ),
          );
      }),
      validate: () =>
        fs.readFileString(manifestPath).pipe(
          Effect.flatMap((content) =>
            Effect.try({
              try: (): unknown => JSON.parse(content),
              catch: (cause) =>
                authoringRefused({
                  category: "validation",
                  detail: `Updated pack manifest could not be parsed: ${manifestPath}`,
                  cause,
                }),
            }),
          ),
          Effect.flatMap(Schema.decodeUnknownEffect(PackManifestSchema)),
          Effect.flatMap((manifest) =>
            removals.every((fqn) => manifest.dependencies[fqn] === undefined)
              ? Effect.void
              : authoringRefused({
                  category: "internal",
                  detail: `Updated pack manifest retained a removed dependency`,
                }),
          ),
          Effect.mapError((cause) =>
            authoringRefused({
              category: "validation",
              detail: `Updated pack manifest failed postcondition validation`,
              cause,
            }),
          ),
        ),
    });

    return {
      result: "success",
      message: `Removed ${removals.length} extension${removals.length === 1 ? "" : "s"} from pack`,
      artifact: packManifestArtifact({
        owner: packOwner,
        name: packName,
        scope: location.scope,
        change: "updated",
        fileCount: 1,
      }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(authoringStepFailure));
