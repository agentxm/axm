import * as Effect from "effect/Effect";
import { resolveFileSelection } from "@agentxm/workspace-kernel/acquisition";
import { observeGitIgnoreInputs } from "@agentxm/workspace-kernel/sources";
import type {
  ExtensionType,
  PublishOptions,
} from "@agentxm/extension-model/unstable/extensions/common";
import { manifestFilenameForType } from "@agentxm/extension-content";
import { PublishFailed } from "./errors.js";
export interface PublishFileSelectionOptions {
  readonly include?: ReadonlyArray<string> | undefined;
  readonly exclude?: ReadonlyArray<string> | undefined;
  readonly manifest?: string;
  readonly boundaryRoot?: string;
}

export const publishArchiveOptions = (
  type: ExtensionType,
  declared: PublishOptions | undefined,
): Effect.Effect<PublishFileSelectionOptions, never> =>
  Effect.succeed({
    ...declared,
    manifest: manifestFilenameForType(type),
  });

/** Resolve one operation-local policy, preserving the original source coordinates. */
export const resolvePublishSelection = (
  directory: string,
  options: PublishFileSelectionOptions,
  requiredManifest: string | undefined,
) =>
  Effect.gen(function* () {
    const snapshot =
      options.include === undefined
        ? yield* observeGitIgnoreInputs({
            packageRoot: directory,
            ...(options.boundaryRoot === undefined ? {} : { boundaryRoot: options.boundaryRoot }),
          }).pipe(
            Effect.mapError(
              (cause) => new PublishFailed({ category: "validation", detail: cause.detail, cause }),
            ),
          )
        : { packageDirectory: "", rules: [], fingerprint: "explicit" };
    const selection = resolveFileSelection({
      packageDirectory: snapshot.packageDirectory,
      gitignore: snapshot.rules,
      ...(options.include === undefined ? {} : { include: options.include }),
      ...(options.exclude === undefined ? {} : { exclude: options.exclude }),
      ...(requiredManifest === undefined ? {} : { manifest: requiredManifest }),
    });
    if (requiredManifest !== undefined) {
      const mandatory = selection.evaluate({ path: requiredManifest, kind: "file" });
      if (!mandatory.included)
        return yield* new PublishFailed({
          category: "validation",
          detail: `publish.exclude pattern "${mandatory.decidingRule?.pattern ?? "unknown"}" removes "${requiredManifest}"; the package cannot be published without it.`,
        });
    }
    return {
      selection,
      policyFingerprint: JSON.stringify({
        snapshot: snapshot.fingerprint,
        include: options.include,
        exclude: options.exclude,
        manifest: requiredManifest,
      }),
    };
  });
