import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AbsolutePathSchema } from "@agentxm/extension-model/unstable/path-types";
import { WorkspaceStateLive } from "@agentxm/workspace-state/live";
import {
  SettingsWriter,
  AcceptedResolutionWriter,
  SettingsWriteError,
  LockfileWriteError,
} from "@agentxm/workspace-state";
import type { ExtensionManagerFailure } from "@agentxm/extension-materialization";
import {
  decodeExtensionNameSync,
  ExtensionFqnSchema,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { PackageUrlSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
export const handle = decodeHandleSync;
export const extensionName = decodeExtensionNameSync;
export const exactVersion = decodeVersionSync;
export const fullyQualifiedName = Schema.decodeUnknownSync(ExtensionFqnSchema);
export const packageUrl = Schema.decodeUnknownSync(PackageUrlSchema);

export interface RecipeWriteFaults {
  readonly setEntry?: () => Effect.Effect<unknown, ExtensionManagerFailure>;
  readonly removeEntry?: () => Effect.Effect<unknown, ExtensionManagerFailure>;
  readonly setAccepted?: () => Effect.Effect<unknown, ExtensionManagerFailure>;
  readonly removeAccepted?: () => Effect.Effect<unknown, ExtensionManagerFailure>;
}

export const recipeWorkspace = (root: string, faults: RecipeWriteFaults = {}) => {
  const state = WorkspaceStateLive({
    scope: "project",
    projectRoot: Schema.decodeUnknownSync(AbsolutePathSchema)(root),
    allowUninitialized: true,
  });
  return Layer.provideMerge(
    Layer.mergeAll(
      Layer.effect(
        SettingsWriter,
        Effect.gen(function* () {
          const writer = yield* SettingsWriter;
          const inject = (effect: Effect.Effect<unknown, ExtensionManagerFailure>) =>
            effect.pipe(
              Effect.asVoid,
              Effect.mapError(
                (cause) => new SettingsWriteError({ path: root, step: "write-temp", cause }),
              ),
            );
          return {
            ...writer,
            setEntry: (...args: Parameters<typeof writer.setEntry>) =>
              writer
                .setEntry(...args)
                .pipe(
                  Effect.andThen(
                    faults.setEntry === undefined ? Effect.void : inject(faults.setEntry()),
                  ),
                ),
            removeEntry: (...args: Parameters<typeof writer.removeEntry>) =>
              writer
                .removeEntry(...args)
                .pipe(
                  Effect.andThen(
                    faults.removeEntry === undefined ? Effect.void : inject(faults.removeEntry()),
                  ),
                ),
          };
        }),
      ),
      Layer.effect(
        AcceptedResolutionWriter,
        Effect.gen(function* () {
          const writer = yield* AcceptedResolutionWriter;
          const inject = (effect: Effect.Effect<unknown, ExtensionManagerFailure>) =>
            effect.pipe(
              Effect.asVoid,
              Effect.mapError(
                (cause) => new LockfileWriteError({ path: root, step: "write-temp", cause }),
              ),
            );
          return {
            ...writer,
            setAccepted: (...args: Parameters<typeof writer.setAccepted>) =>
              writer
                .setAccepted(...args)
                .pipe(
                  Effect.andThen(
                    faults.setAccepted === undefined ? Effect.void : inject(faults.setAccepted()),
                  ),
                ),
            removeAccepted: (...args: Parameters<typeof writer.removeAccepted>) =>
              writer
                .removeAccepted(...args)
                .pipe(
                  Effect.andThen(
                    faults.removeAccepted === undefined
                      ? Effect.void
                      : inject(faults.removeAccepted()),
                  ),
                ),
          };
        }),
      ),
    ),
    state,
  );
};
