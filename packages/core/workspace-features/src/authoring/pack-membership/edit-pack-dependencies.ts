/**
 * Edit-pack-dependencies operation — applies a precomputed dependency delta
 * (additions or removals) to a pack manifest.
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
import type {
  Handle,
  PackMemberConstraint,
  PackMemberConstraintMap,
} from "@agentxm/extension-model/unstable/extensions";
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
import { decodeVersionRangeSync } from "@agentxm/extension-model/unstable/version-constraints";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { authoringRefused } from "../errors.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * The precomputed manifest delta: dependencies to add, or dependencies to remove.
 */
type PackDependencyEdit =
  | {
      readonly _tag: "Add";
      /** FQN -> version range entries to add. */
      readonly additions: Readonly<Record<string, string>>;
    }
  | {
      readonly _tag: "Remove";
      /** Extension names to remove. */
      readonly removals: ReadonlyArray<string>;
    };

/**
 * Args for the edit-pack-dependencies operation.
 */
interface EditPackDependenciesOperationArgs {
  /** Pack name (without owner). */
  readonly packName: string;
  /** Pack owner (e.g., "@myorg"). */
  readonly packOwner: Handle;
  /** Precomputed manifest delta. */
  readonly edit: PackDependencyEdit;
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
 * Add extensions to, or remove extensions from, a pack manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EditPackDependenciesOperation = Operation<
  "edit-pack-dependencies",
  EditPackDependenciesOperationArgs
>;

// -----------------------------------------------------------------------------
// Per-edit rules
// -----------------------------------------------------------------------------

/** What differs between adding and removing pack dependencies. */
interface PackDependencyEditRules {
  /** Number of requested entries; zero short-circuits the edit. */
  readonly count: number;
  /** Success message when there is nothing to change. */
  readonly emptyMessage: string;
  /** Derive the updated dependencies from the prepared ones without modifying them. */
  readonly apply: (dependencies: PackMemberConstraintMap) => PackMemberConstraintMap;
  /** Whether the written dependencies reflect the requested edit. */
  readonly retained: (dependencies: PackMemberConstraintMap) => boolean;
  /** Postcondition failure detail when they do not. */
  readonly retainFailure: string;
  /** Success message after the manifest is written. */
  readonly successMessage: string;
}

const editRules = (edit: PackDependencyEdit): PackDependencyEditRules => {
  if (edit._tag === "Add") {
    const { additions } = edit;
    const count = Object.keys(additions).length;
    return {
      count,
      emptyMessage: "No pack entries added",
      apply: (manifestDependencies) => {
        const dependencies: Record<string, PackMemberConstraint> = { ...manifestDependencies };
        for (const [fqn, version] of Object.entries(additions)) {
          dependencies[fqn] = decodeVersionRangeSync(version);
        }
        return dependencies satisfies PackMemberConstraintMap;
      },
      retained: (dependencies) =>
        Object.entries(additions).every(([fqn, constraint]) => dependencies[fqn] === constraint),
      retainFailure: `Updated pack manifest did not retain the requested dependencies`,
      successMessage: `Added ${count} extension${count === 1 ? "" : "s"} to pack`,
    };
  }
  const { removals } = edit;
  return {
    count: removals.length,
    emptyMessage: "No pack entries removed",
    apply: (manifestDependencies) => {
      const removalSet = new Set(removals);
      return Object.fromEntries(
        Object.entries(manifestDependencies).filter(([name]) => !removalSet.has(name)),
      );
    },
    retained: (dependencies) => removals.every((fqn) => dependencies[fqn] === undefined),
    retainFailure: `Updated pack manifest retained a removed dependency`,
    successMessage: `Removed ${removals.length} extension${removals.length === 1 ? "" : "s"} from pack`,
  };
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Edit-pack-dependencies operation handler.
 *
 * 1. Short-circuit if the delta is empty (no-op)
 * 2. Read current manifest under the workspace lock
 * 3. Compare it with the prepared text (stale check)
 * 4. Apply the delta to manifest
 * 5. Write updated manifest
 */
export const editPackDependencies: OperationHandler<
  EditPackDependenciesOperation,
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
    const { packName, packOwner, edit, prepared } = op.args;
    const configured = (yield* (yield* SettingsReader).entries("pack"))[packName];
    if (configured === undefined || !isWorkspaceSourceLocator(configured.source)) {
      return yield* authoringRefused({
        category: "conflict",
        detail: `Pack "${packName}" is not an authored workspace pack`,
        recover: "Only workspace-authored packs can be edited in place.",
      });
    }
    const rules = editRules(edit);
    // 1. Short-circuit if nothing to change
    if (rules.count === 0) {
      return { result: "success", message: rules.emptyMessage } satisfies JobStepResult;
    }

    const manifestPath = path.join(
      layout.authoredRoot("pack"),
      packName,
      manifestFilenameForType("pack"),
    );
    yield* runWorkspaceTransaction({
      targets: [manifestPath],
      transition: Effect.gen(function* () {
        // Read and stale-check under the workspace lock.
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

        // 4. Apply the delta to a copy of the prepared manifest
        const manifest = prepared.manifest;
        const dependencies = rules.apply(manifest.dependencies);

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
            rules.retained(manifest.dependencies)
              ? Effect.void
              : authoringRefused({
                  category: "internal",
                  detail: rules.retainFailure,
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
      message: rules.successMessage,
      artifact: packManifestArtifact({
        owner: packOwner,
        name: packName,
        scope: location.scope,
        change: "updated",
        fileCount: 1,
      }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(authoringStepFailure));
