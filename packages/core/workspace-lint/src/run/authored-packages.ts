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
import {
  resolveWorkspaceExtensionRef,
  settingsEntries,
  type Settings,
  type WorkspaceLayout,
} from "@agentxm/workspace-state";

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

export const observeAuthoredPackages = (args: {
  readonly layout: WorkspaceLayout;
  readonly settings: Settings;
}): Effect.Effect<
  ReadonlyArray<AuthoredPackageObservation>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const layout = args.layout;
    if (layout.scope !== "project") return [];
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const perType = yield* Effect.forEach(extensionTypes, (type) =>
      Effect.gen(function* () {
        const root = layout.authoredRoot(type);
        const names = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => []));
        const observed: Array<AuthoredPackageObservation> = [];
        for (const name of [...names].sort()) {
          if (!Schema.is(ExtensionNameSchema)(name)) continue;
          const packagePath = path.join(root, name);
          const isLink = yield* fs.readLink(packagePath).pipe(
            Effect.as(true),
            Effect.orElseSucceed(() => false),
          );
          if (isLink) continue;
          const ref = yield* resolveWorkspaceExtensionRef({
            settingsName: name,
            source: "workspace",
            expectedType: type,
            layout,
            scope: "project",
          }).pipe(Effect.option);
          if (Option.isNone(ref)) continue;
          observed.push({
            type,
            name,
            owner: ref.value.owner,
            version: ref.value.version,
            path: packagePath,
            declared: settingsEntries[type].entries(args.settings)[name]?.source === "workspace",
          });
        }
        return observed;
      }),
    );
    return perType.flat();
  });
