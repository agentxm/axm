import type { PackManagerService } from "../materialization/managers.js";

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
import { fromFileLocation } from "@agentxm/host-primitives";
import {
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
} from "./errors.js";
import {
  reusableCanonicalTree,
  replaceCanonicalDirectoryWithInspection,
} from "../acquisition/canonical-directory.js";
import { configuredPacksToDiskRefs } from "../acquisition/materializable-from-disk.js";
import {
  makeBaseManagerMembers,
  listMaterializableFromDisk,
} from "../materialization/manager-kit.js";
import type {
  PackRef,
  RegistryPackRef,
} from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { SourceHostProviders } from "../resolution/sources/index.js";
import { PackManager, type PackMaterializationFacts } from "../materialization/managers.js";
import { type SetPackArgs } from "../desired-state/index.js";
import { copyExtensionDirectory } from "../acquisition/copy-directory.js";
import { computePackPathsForLayout } from "../desired-state/index.js";
import { removeIfExists } from "../desired-state/index.js";
import { validateExactResolvedVersion } from "../desired-state/index.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
} from "../desired-state/index.js";
import { computePackManifestContentIdentity } from "../desired-state/index.js";
import { computePackageContentHash } from "../desired-state/index.js";
import {
  gitSourceLockFields,
  pathSourceLockFields,
  registrySourceLockFields,
} from "../desired-state/lockfile/entry-fields.js";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
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
  name: ref.pack.name,
  lockEntry: {
    ...registrySourceLockFields(
      ref.source,
      ref.owner,
      ref.name,
      decodeVersionSync(ref.version),
      Option.getOrElse(ref.integrity, () => ""),
      ref.publisherBindingId,
      treeIntegrity,
    ),
    manifestVersion: ref.version,
    manifestContentIdentity: computePackManifestContentIdentity({
      owner: ref.owner,
      type: "pack",
      name: ref.pack.name,
      version: ref.version,
      dependencies: ref.pack.dependencies,
    }),
    members: Object.keys(ref.pack.dependencies),
  },
  versionRange,
});

const buildExternalSetPackArgs = (args: {
  readonly ref: Exclude<PackRef, { readonly refType: "registry" | "workspace" }>;
  readonly versionRange: Option.Option<string>;
  readonly treeIntegrity: TreeIntegrity;
  readonly contentIdentity: SourceHash;
  readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
  /** The workspace-relative source view a local Pack and its members were discovered under. */
  readonly workspaceRelativeLocalSourceRoot: Option.Option<string>;
}): SetPackArgs => {
  const shared = {
    manifestVersion: args.ref.version,
    manifestContentIdentity: computePackManifestContentIdentity({
      owner: args.ref.owner,
      type: "pack",
      name: args.ref.pack.name,
      version: args.ref.version,
      dependencies: args.ref.pack.dependencies,
    }),
    members: Object.keys(args.ref.pack.dependencies),
  };
  if (args.ref.refType === "local") {
    const localSourcePath = args.ref.source.path;
    return {
      name: args.ref.pack.name,
      lockEntry: {
        ...pathSourceLockFields(
          Option.getOrElse(args.workspaceRelativeLocalSourcePath, () => localSourcePath),
          args.contentIdentity,
          args.ref.name,
          args.treeIntegrity,
          args.ref.owner,
        ),
        ...shared,
        sourceRoot: Option.getOrElse(args.workspaceRelativeLocalSourceRoot, () => localSourcePath),
      },
      versionRange: args.versionRange,
    };
  }
  return {
    name: args.ref.pack.name,
    lockEntry: {
      ...gitSourceLockFields(
        args.ref.source,
        Option.fromUndefinedOr(args.ref.sourcePath),
        args.ref.gitCommitSha,
        args.ref.gitTreeSha,
        args.ref.owner,
        args.ref.name,
        args.treeIntegrity,
      ),
      ...shared,
      ...Option.match(args.ref.source.subPath, {
        onNone: () => ({}),
        onSome: (sourceRoot) => ({ sourceRoot }),
      }),
    },
    versionRange: args.versionRange,
  };
};

const sourceLayoutFamily = (
  ref: Exclude<PackRef, { readonly refType: "workspace" }>,
): "git" | "path" | "registry" => {
  switch (ref.source.type) {
    case "local":
      return "path";
    case "git":
      return "git";
    case "registry":
      return "registry";
  }
};

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
        ref.refType === "workspace" ? "workspace" : sourceLayoutFamily(ref),
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
      const reusable = yield* reusableCanonicalTree({
        canonicalPath: packDir,
        requested:
          ref.refType === "registry"
            ? {
                refType: "registry",
                owner: ref.owner,
                name: ref.pack.name,
                version: ref.version,
                publisherBindingId: ref.publisherBindingId,
              }
            : { refType: ref.refType, name: ref.pack.name },
        accepted: yield* lockfile.entry("pack", ref.pack.name),
        force: force === true,
      });
      if (Option.isSome(reusable)) return acquired(reusable.value);

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
    ) =>
      Effect.gen(function* () {
        if (ref.refType === "workspace") return Option.none();
        const treeIntegrity = materialization.pipe(Option.flatMap((facts) => facts.treeIntegrity));
        if (Option.isNone(treeIntegrity)) {
          return yield* new PackInstallStateMissing({ name: ref.pack.name });
        }
        if (ref.refType === "registry") {
          return Option.some(buildSetPackArgs(ref, versionRange, treeIntegrity.value));
        }
        const packDir = computePackPathsForLayout(
          path.join,
          currentLayout(),
          sourceLayoutFamily(ref),
          ref.owner,
          ref.pack.name,
        ).canonicalPath;
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(path, baseDir, fromFileLocation(ref.location))
            : Option.none<string>();
        const workspaceRelativeLocalSourceRoot =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none<string>();
        if (
          ref.refType === "local" &&
          (Option.isNone(workspaceRelativeLocalSourcePath) ||
            Option.isNone(workspaceRelativeLocalSourceRoot))
        ) {
          return yield* new PackDefinitionInvalid({
            detail: `Local Pack source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        return Option.some(
          buildExternalSetPackArgs({
            ref,
            versionRange,
            treeIntegrity: treeIntegrity.value,
            contentIdentity: yield* computePackageContentHash(packDir),
            workspaceRelativeLocalSourcePath,
            workspaceRelativeLocalSourceRoot,
          }),
        );
      });

    return {
      ...makeBaseManagerMembers({
        type: "pack",
        spanPrefix: "PackManager",
        records,
        settings,
        refName: (ref) => ref.pack.name,
        materializeInstall,
        // A Pack restores no content of its own; its members restore theirs.
        retained: () => Effect.succeed(noContent),
      }),
      materializeInstall,
      acquireCanonical: materializeInstall,
      listMaterializable: () =>
        listMaterializableFromDisk({
          type: "pack",
          records,
          toDiskRefs: configuredPacksToDiskRefs,
          env: { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
        }),
      materializeUninstall,

      acceptedResolution: Effect.fn("PackManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }) {
        const args = yield* buildCurrentPackArgs(ref, Option.none(), materialization);
        return Option.map(args, ({ lockEntry: entry }) => ({
          key: ref.pack.name,
          entry,
        }));
      }),

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies PackManagerService;
  }),
);
