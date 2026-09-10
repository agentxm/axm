/**
 * Add-to-pack operation — applies a precomputed manifest-add delta to a pack manifest.
 *
 * Validates manifest precondition (stale check) before writing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AuthoringFailed } from "../errors.js";
import { AuthoringFailureAdapter, withAdaptedStepFailures } from "../failure-adapter.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import type { OperationHandler } from "@agentxm/workspace-operations";
import type { Operation } from "@agentxm/workspace-operations";
import type { JobStepResult } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { packManifestArtifact } from "./artifact.js";
import { hashContent } from "./hash-content.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the add-to-pack operation.
 */
export interface AddToPackOperationArgs {
  /** Pack name (without owner). */
  readonly packName: string;
  /** Pack owner (e.g., "@myorg"). */
  readonly packOwner: Handle;
  /** Precomputed manifest delta: FQN -> version range entries to add. */
  readonly additions: Readonly<Record<string, string>>;
  /** Manifest content hash at plan time for stale-check. */
  readonly manifestHash: string;
}

/**
 * Add extensions to a pack manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AddToPackOperation = Operation<"add-to-pack", AddToPackOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Add-to-pack operation handler.
 *
 * 1. Short-circuit if additions map is empty (no-op)
 * 2. Read current manifest and compute hash
 * 3. Compare hash with args.manifestHash (stale check)
 * 4. Apply additions to manifest
 * 5. Write updated manifest
 */
export const addToPack: OperationHandler<
  AddToPackOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | AuthoringFailureAdapter
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    if (ws.layout.scope !== "project") {
      return yield* new AuthoringFailed({
        category: "validation",
        detail: "Authored packs can only be edited in a project workspace",
      });
    }
    const { packName, packOwner, additions, manifestHash } = op.args;
    const configured = (yield* ws.getConfiguredPackEntries())[packName];
    if (configured === undefined || !isWorkspaceSourceLocator(configured.source)) {
      return yield* new AuthoringFailed({
        category: "conflict",
        detail: `Pack "${packName}" is not an authored workspace pack`,
        recover: "Only workspace-authored packs can be edited in place.",
      });
    }
    // 1. Short-circuit if nothing to add
    if (Object.keys(additions).length === 0) {
      return { result: "success", message: "No pack entries added" } satisfies JobStepResult;
    }

    const manifestPath = path.join(
      ws.layout.authoredRoot("pack"),
      packName,
      PACK_MANIFEST_FILENAME,
    );
    yield* ws.runTransaction({
      targets: [manifestPath],
      transition: Effect.gen(function* () {
        // Read and stale-check under the workspace lock.
        const manifestContent = yield* fs.readFileString(manifestPath).pipe(
          Effect.mapError(
            (e) =>
              new AuthoringFailed({
                category: "not_found",
                detail: `Pack manifest not found at ${manifestPath}`,
                suggestions: [{ description: "Ensure the pack exists on disk" }],
                cause: e,
              }),
          ),
        );

        // 3. Stale-check: compare content hash
        const currentHash = hashContent(manifestContent);
        if (currentHash !== manifestHash) {
          return yield* new AuthoringFailed({
            category: "conflict",
            detail: `Pack manifest is stale — it was modified since the plan was created`,
            suggestions: [{ description: "Re-run the command to create a fresh plan" }],
          });
        }

        // 4. Parse and apply additions
        const json = yield* Effect.try({
          try: () => {
            const parsed: unknown = JSON.parse(manifestContent);
            return parsed;
          },
          catch: (e) =>
            new AuthoringFailed({
              category: "validation",
              detail: `Failed to parse pack manifest: ${manifestPath}`,
              cause: e,
            }),
        });

        const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
          Effect.mapError(
            (e) =>
              new AuthoringFailed({
                category: "validation",
                detail: `Invalid pack manifest: ${manifestPath}`,
                cause: e,
              }),
          ),
        );

        const dependencies: Record<string, string> = { ...manifest.dependencies };
        for (const [fqn, version] of Object.entries(additions)) {
          dependencies[fqn] = version;
        }

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
          Effect.mapError(
            (cause) =>
              new AuthoringFailed({
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
            Effect.mapError(
              (e) =>
                new AuthoringFailed({
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
                new AuthoringFailed({
                  category: "validation",
                  detail: `Updated pack manifest could not be parsed: ${manifestPath}`,
                  cause,
                }),
            }),
          ),
          Effect.flatMap(Schema.decodeUnknownEffect(PackManifestSchema)),
          Effect.flatMap((manifest) =>
            Object.entries(additions).every(
              ([fqn, constraint]) => manifest.dependencies[fqn] === constraint,
            )
              ? Effect.void
              : new AuthoringFailed({
                  category: "internal",
                  detail: `Updated pack manifest did not retain the requested dependencies`,
                }),
          ),
          Effect.mapError(
            (cause) =>
              new AuthoringFailed({
                category: "validation",
                detail: `Updated pack manifest failed postcondition validation`,
                cause,
              }),
          ),
        ),
    });

    return {
      result: "success",
      message: `Added ${Object.keys(additions).length} extension${Object.keys(additions).length === 1 ? "" : "s"} to pack`,
      artifact: packManifestArtifact({
        owner: packOwner,
        name: packName,
        scope: ws.scope,
        change: "updated",
        fileCount: 1,
      }),
    } satisfies JobStepResult;
  }).pipe(withAdaptedStepFailures);
