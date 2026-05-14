/**
 * Shared reconciliation utilities for disk compatibility checks.
 *
 * Extracts the common pattern used by skills and packs reconciliation adapters
 * for checking disk existence, reading manifests, and decoding them.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError } from "../app-error/index.js";
import type {
  AdapterEnvironment,
  ReconciliationDeclaration,
  DeclarationResolution,
} from "../workspace/reconciliation-types.js";

/**
 * Check that a canonical path exists on disk, read a manifest file,
 * parse its JSON, and decode it with the provided function.
 *
 * Returns an Unresolved DeclarationResolution when the path is missing,
 * the manifest is empty, JSON parsing fails, or decoding fails.
 * Returns the decoded manifest on success.
 */
export const readAndDecodeManifest = <A>(
  declaration: ReconciliationDeclaration,
  canonicalPath: string,
  manifestFilename: string,
  decode: (json: unknown) => A | null,
  extensionLabel: string,
  env: AdapterEnvironment,
) =>
  Effect.gen(function* () {
    const exists = yield* env.fs.exists(canonicalPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check ${extensionLabel} path: ${canonicalPath}`,
          cause: error,
        }),
      ),
    );

    if (!exists) {
      return {
        _tag: "Unresolved",
        declaration,
        reason: "missing",
      } satisfies DeclarationResolution;
    }

    const manifestPath = env.path.join(canonicalPath, manifestFilename);
    const manifestRaw = yield* env.fs
      .readFileString(manifestPath)
      .pipe(Effect.catch(() => Effect.succeed("")));

    if (manifestRaw.length === 0) {
      return {
        _tag: "Unresolved",
        declaration,
        reason: "invalid",
      } satisfies DeclarationResolution;
    }

    const manifestJson: unknown = yield* Effect.try({
      try: () => JSON.parse(manifestRaw),
      catch: () => "parse-failed",
    }).pipe(Effect.catch(() => Effect.void));

    const manifest = decode(manifestJson);

    if (manifest === null) {
      return {
        _tag: "Unresolved",
        declaration,
        reason: "invalid",
      } satisfies DeclarationResolution;
    }

    return { _tag: "ok" as const, manifest, canonicalPath };
  });
