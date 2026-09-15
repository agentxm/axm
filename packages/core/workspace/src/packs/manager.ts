import { LifecyclePostconditionViolated } from "../transitions/planning/index.js";
import type { PackManagerService } from "../materialization/managers.js";
import { usableAcceptedCanonical } from "../desired-state/index.js";

/**
 * Pack manager service.
 *
 * Implements Pack materialization. Delegates to existing
 * pack materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../desired-state/index.js";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
} from "./errors.js";
import {
  canReuseInstalledPackage,
  replaceCanonicalDirectoryWithInspection,
} from "../acquisition/canonical-directory.js";
import { configuredPacksToDiskRefs } from "../acquisition/materializable-from-disk.js";
import type {
  PackRef,
  RegistryPackRef,
} from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { SourceHostProviders } from "@agentxm/extension-sources";
import { PackManager, type PackMaterializationFacts } from "../materialization/managers.js";
import type { ExtensionTarget } from "../desired-state/index.js";
import { type SetPackArgs } from "../desired-state/index.js";
import { copyExtensionDirectory } from "../acquisition/copy-directory.js";
import { computePackPathsForLayout } from "../desired-state/index.js";
import { removeIfExists } from "../desired-state/index.js";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "../desired-state/index.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { configuredRowsByName } from "../desired-state/index.js";
import { isObservedInstalled } from "../desired-state/index.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../desired-state/index.js";
import { computePackManifestContentIdentity } from "../desired-state/index.js";
import {
  computeMaterializedTreeIntegrity,
  type MaterializedTreeInvalid,
  type TreeIntegrity,
} from "../desired-state/index.js";

// Build pack SetPackArgs from a registry ref
const buildSetPackArgs = (
  ref: RegistryPackRef,
  versionRange: Option.Option<string>,
  treeIntegrity: TreeIntegrity,
): SetPackArgs => ({
  type: "registry",
  sourceType: "registry",
  packageFormat: "agentxm",
  endpoint: ref.source.location,
  extensionType: "pack",
  workspaceName: ref.pack.name,
  owner: ref.owner,
  name: ref.pack.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: ref.source.name,
  publisherBindingId: ref.publisherBindingId,
  treeIntegrity,
  manifestContentIdentity: computePackManifestContentIdentity({
    owner: ref.owner,
    type: "pack",
    name: ref.pack.name,
    version: ref.version,
    dependencies: ref.pack.dependencies,
  }),
  versionRange,
});

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const PackManagerLive = Layer.effect(
  PackManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const records = yield* WorkspaceRecords;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = location.baseDir;

    const noContent: PackMaterializationFacts = {
      treeIntegrity: Option.none(),
    };
    const acquired = (treeIntegrity: TreeIntegrity): PackMaterializationFacts => ({
      treeIntegrity: Option.some(treeIntegrity),
    });

    const materializeInstall: PackManagerService["materializeInstall"] = Effect.fn(
      "PackManager.materializeInstall",
    )(function* ({ ref, force }: { readonly ref: PackRef; readonly force?: boolean }) {
      if (ref.refType === "registry") {
        yield* validateExactResolvedVersion(`packs.${ref.pack.name}.resolvedVersion`, ref.version);
      }

      const packDir = computePackPathsForLayout(
        path.join,
        currentLayout(),
        ref.refType === "workspace" ? "workspace" : ref.source.name,
        ref.owner,
        ref.pack.name,
      ).canonicalPath;
      const canonicalExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));
      if (ref.refType === "workspace") {
        if (ref.scope !== location.scope || path.resolve(ref.location) !== path.resolve(packDir)) {
          return yield* new PackDefinitionInvalid({
            detail: `Invalid workspace pack source location: ${ref.location}`,
          });
        }
        if (!canonicalExists) {
          return yield* new PackDefinitionInvalid({
            detail: `Workspace pack package is missing: ${packDir}`,
          });
        }
        return noContent;
      }
      const lockedEntry = yield* lockfile.entry("pack", ref.pack.name);
      const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, ref);
      if (
        yield* canReuseInstalledPackage({
          installedPath: packDir,
          force: force === true,
          refVersion: ref.version,
          hasIntegrity: Option.isSome(ref.integrity),
          ...(lockedVersion === undefined ? {} : { lockedVersion }),
          existsFailureDetail: (target) =>
            `Failed to check if canonical pack path exists: ${target}`,
        })
      ) {
        if (Option.isSome(lockedEntry)) {
          const observedTree = yield* computeMaterializedTreeIntegrity(packDir);
          if (observedTree === lockedEntry.value.treeIntegrity) {
            return acquired(lockedEntry.value.treeIntegrity);
          }
        }
      }

      return yield* Effect.scoped(
        Effect.gen(function* () {
          const fetched = yield* sources
            .fetch(ref)
            .pipe(
              Effect.mapError(
                (e: Error) => new PackArchiveFetchFailed({ message: e.message, cause: e }),
              ),
            );
          const materialized = yield* replaceCanonicalDirectoryWithInspection<
            TreeIntegrity,
            PackStagingFailed | MaterializedTreeInvalid,
            FileSystem.FileSystem | Path.Path
          >({
            baseDir,
            canonicalPath: packDir,
            populate: (stagingPath) =>
              copyExtensionDirectory(fetched.directory, stagingPath).pipe(
                Effect.mapError((cause) => new PackStagingFailed({ packDir, cause })),
              ),
            inspect: computeMaterializedTreeIntegrity,
          });
          return acquired(materialized.inspection);
        }),
      );
    });
    const materializeUninstall: PackManagerService["materializeUninstall"] = Effect.fn(
      "PackManager.materializeUninstall",
    )(function* ({ target }) {
      const canonical = yield* acceptedCanonicalObservation({
        type: "pack",
        name: target.name,
      });
      const packDir = removableAcceptedCanonicalPath(canonical);
      if (Option.isSome(packDir)) yield* removeIfExists(fs, packDir.value);
      return noContent;
    });

    const buildCurrentPackArgs = (
      ref: PackRef,
      versionRange: Option.Option<string>,
      materialization: Option.Option<PackMaterializationFacts>,
    ): Effect.Effect<Option.Option<SetPackArgs>, PackInstallStateMissing> =>
      Effect.gen(function* () {
        if (ref.refType !== "registry") return Option.none();
        const treeIntegrity = materialization.pipe(Option.flatMap((facts) => facts.treeIntegrity));
        if (Option.isNone(treeIntegrity)) {
          return yield* new PackInstallStateMissing({ name: ref.pack.name });
        }
        return Option.some(buildSetPackArgs(ref, versionRange, treeIntegrity.value));
      });

    return {
      isInstalled: Effect.fn("PackManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(records, "pack", target.name);
      }),
      materializeInstall,
      acquireCanonical: materializeInstall,
      prepareSourceTransition: ({ ref }) =>
        prepareAcceptedCanonicalTransition({
          type: "pack",
          name: ref.pack.name,
          ref,
        }),
      getConfiguredSource: Effect.fn("PackManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* settings.entries("pack");
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("PackManager.listMaterializable")(function* () {
        const configured = yield* records.rows("pack").pipe(Effect.map(configuredRowsByName));
        return yield* configuredPacksToDiskRefs(
          { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
          configured,
        );
      }),
      materializeUninstall,
      materializeRetained: ({ target }) =>
        Effect.gen(function* () {
          const canonical = yield* usableAcceptedCanonical({
            type: "pack",
            name: target.name,
          });
          if (Option.isNone(canonical) || canonical.value.ref.type !== "pack") {
            return yield* new LifecyclePostconditionViolated({
              postcondition: "materialize-observable",
              targetType: "pack",
              targetName: target.name,
            });
          }
          return noContent;
        }),

      acceptedResolution: Effect.fn("PackManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }) {
        const args = yield* buildCurrentPackArgs(ref, Option.none(), materialization);
        return Option.map(args, ({ versionRange: _versionRange, ...entry }) => ({
          key: ref.pack.name,
          entry,
        }));
      }),

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies PackManagerService;
  }),
);
