/**
 * Authored packages in each type's standard authoring folder.
 *
 * A directory there is an authored package only when its manifest resolves
 * with the identity its path names; anything else is a lookalike and is not
 * observed here. Declaration is read from local settings, including disabled
 * entries, so an undeclared package is visible without resolving desired
 * state. User scope has no authoring folders.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  ExtensionNameSchema,
  extensionTypes,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import { readExtensionManifest, type ExtensionManifest } from "@agentxm/extension-content";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  freezeWorkspaceValue,
  resolveWorkspaceExtensionRef,
  settingsEntries,
  type Settings,
  type WorkspaceLayout,
} from "@agentxm/workspace-kernel/workspace-state";

/** One valid authored package at its authoring location. */
export interface AuthoredPackageObservation {
  readonly type: ExtensionType;
  readonly name: string;
  readonly owner: string;
  readonly version: string;
  /** Absolute authoring path. */
  readonly path: string;
  /** Whether settings declare this type and name with a workspace source. */
  readonly declared: boolean;
}

/**
 * One authored package's successful resolution: the root it resolved under
 * `layout`, its deep-frozen manifest decode, and its package content hash.
 */
export interface AuthoredPackageResolution {
  readonly type: ExtensionType;
  readonly name: string;
  readonly layout: WorkspaceLayout;
  readonly root: string;
  readonly manifest: ExtensionManifest;
  readonly hash: SourceHash;
}

/**
 * The authored packages, with each successful resolution, for a caller that
 * resolves the same packages again in the same read phase.
 */
export const observeAuthoredPackages = (args: {
  readonly layout: WorkspaceLayout;
  readonly settings: Settings;
}): Effect.Effect<
  {
    readonly packages: ReadonlyArray<AuthoredPackageObservation>;
    readonly resolutions: ReadonlyArray<AuthoredPackageResolution>;
  },
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const layout = args.layout;
    if (layout.scope !== "project") return { packages: [], resolutions: [] };
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const perType = yield* Effect.forEach(extensionTypes, (type) =>
      Effect.gen(function* () {
        const root = layout.authoredRoot(type);
        const names = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => []));
        const observed: Array<AuthoredPackageObservation> = [];
        const resolved: Array<AuthoredPackageResolution> = [];
        for (const name of [...names].sort()) {
          if (!Schema.is(ExtensionNameSchema)(name)) continue;
          const packagePath = path.join(root, name);
          const isLink = yield* fs.readLink(packagePath).pipe(
            Effect.as(true),
            Effect.orElseSucceed(() => false),
          );
          if (isLink) continue;
          // The resolution decodes the manifest through this read, at the
          // point it reads it itself, so its decode can be kept.
          let decoded: ExtensionManifest | undefined;
          const ref = yield* resolveWorkspaceExtensionRef({
            settingsName: name,
            source: "workspace",
            expectedType: type,
            layout,
            scope: "project",
            prepared: {
              root: packagePath,
              type,
              manifest: readExtensionManifest(packagePath, type).pipe(
                Effect.tap(({ manifest }) =>
                  Effect.sync(() => {
                    decoded = manifest;
                  }),
                ),
              ),
            },
          }).pipe(Effect.option);
          if (Option.isNone(ref)) continue;
          if (decoded !== undefined && ref.value.location === packagePath)
            resolved.push(
              Object.freeze({
                type,
                name,
                layout,
                root: packagePath,
                manifest: freezeWorkspaceValue(decoded),
                hash: ref.value.sourceHash,
              }),
            );
          observed.push({
            type,
            name,
            owner: ref.value.owner,
            version: ref.value.version,
            path: packagePath,
            declared: settingsEntries[type].entries(args.settings)[name]?.source === "workspace",
          });
        }
        return { observed, resolved };
      }),
    );
    return {
      packages: perType.flatMap(({ observed }) => observed),
      resolutions: Object.freeze(perType.flatMap(({ resolved }) => resolved)),
    };
  });
