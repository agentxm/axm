/**
 * Extension-type-agnostic workspace classifier.
 *
 * Derives lifecycle sets (configured, implicit, unmanaged) from workspace
 * state. The same taxonomy applies to skills, commands, mcpServers, and packs.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionType } from "@axm.sh/core/unstable/extensions";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { expandGlob } from "@axm.sh/core/unstable/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClassifierExtensionType = ExtensionType;

type PackagingKind = "native" | "non-native";

type ClassifiedExtension =
  | {
      readonly type: ClassifierExtensionType;
      readonly name: string;
      readonly source: string;
      readonly enabled: boolean;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
      readonly lifecycle: "configured";
    }
  | {
      readonly type: ClassifierExtensionType;
      readonly name: string;
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly isBuiltIn: boolean;
      readonly lifecycle: "implicit" | "unmanaged";
    };

interface ClassifierInput {
  readonly type: ClassifierExtensionType;
  readonly configured: Readonly<
    Record<string, { readonly source: string; readonly enabled?: boolean }>
  >;
  readonly lockedNames: ReadonlyArray<string>;
  readonly detectedNames: ReadonlyArray<string>;
  readonly ignoredPatterns: ReadonlyArray<string>;
  readonly sourceMetaByName: Readonly<
    Record<string, { readonly packagingKind: PackagingKind; readonly isBuiltIn: boolean }>
  >;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a name matches any of the ignored patterns.
 *
 * Reuses `expandGlob` from the shared glob helper to ensure consistent
 * matching semantics (simple `*` wildcards, case-sensitive, full-name anchored).
 */
const isIgnoredName = (patterns: ReadonlyArray<string>, name: string): boolean =>
  Array.some(patterns, (pattern) => expandGlob(pattern, [name]).length > 0);

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify extensions into lifecycle sets.
 *
 * Algorithm:
 * 1. Check for invalid lockfile-only non-native entries -> fail
 * 2. Configured: entries from `input.configured` (sorted by name)
 * 3. Implicit: locked names not in configured, not ignored, with native packagingKind (sorted)
 * 4. Unmanaged: detected names not in configured, not implicit, not ignored (sorted)
 * 5. Output: [...configured, ...implicit, ...unmanaged]
 */
const classifyExtensions = (
  input: ClassifierInput,
): Effect.Effect<
  ReadonlyArray<ClassifiedExtension>,
  import("@axm.sh/core/unstable/app-error").AppError
> =>
  Effect.gen(function* () {
    const sourceMetaFor = (name: string) =>
      input.sourceMetaByName[name] ?? {
        packagingKind: input.type === "pack" ? ("native" as const) : ("non-native" as const),
        isBuiltIn: false,
      };

    const configuredNames = new Set(Object.keys(input.configured));

    // Step 1: Validate lockfile-only non-native entries
    const invalidLockfileOnlyNonNative = Array.filter(
      input.lockedNames,
      (name) =>
        !configuredNames.has(name) &&
        !isIgnoredName(input.ignoredPatterns, name) &&
        sourceMetaFor(name).packagingKind !== "native",
    );

    if (invalidLockfileOnlyNonNative.length > 0) {
      return yield* makeAppError({
        code: "WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY",
        what: "Lockfile-only non-native entries are invalid classifier input",
        details: invalidLockfileOnlyNonNative,
        howToFix:
          "Remove the lockfile-only non-native entries or add explicit configured entries in settings.",
      });
    }

    // Step 2: Implicit — locked names not in configured, not ignored, native only
    const implicitNames = new Set(
      Array.filter(
        input.lockedNames,
        (name) =>
          !configuredNames.has(name) &&
          !isIgnoredName(input.ignoredPatterns, name) &&
          sourceMetaFor(name).packagingKind === "native",
      ),
    );

    // Step 3: Unmanaged — detected names not in configured, not implicit, not ignored
    const unmanagedNames = Array.filter(
      Array.dedupe(input.detectedNames),
      (name) =>
        !configuredNames.has(name) &&
        !implicitNames.has(name) &&
        !isIgnoredName(input.ignoredPatterns, name),
    );

    // Step 4: Build classified rows

    const configured: ReadonlyArray<ClassifiedExtension> = Object.entries(input.configured)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, entry]) => {
        const sourceMeta = sourceMetaFor(name);
        return {
          type: input.type,
          name,
          source: entry.source,
          enabled: entry.enabled ?? true,
          packagingKind: sourceMeta.packagingKind,
          isBuiltIn: sourceMeta.isBuiltIn,
          lifecycle: "configured" as const,
        };
      });

    const implicit: ReadonlyArray<ClassifiedExtension> = [...implicitNames].sort().map((name) => {
      const sourceMeta = sourceMetaFor(name);
      return {
        type: input.type,
        name,
        source: Option.none<string>(),
        enabled: true as const,
        packagingKind: sourceMeta.packagingKind,
        isBuiltIn: sourceMeta.isBuiltIn,
        lifecycle: "implicit" as const,
      };
    });

    const unmanaged: ReadonlyArray<ClassifiedExtension> = unmanagedNames.sort().map((name) => {
      const sourceMeta = sourceMetaFor(name);
      return {
        type: input.type,
        name,
        source: Option.none<string>(),
        enabled: true as const,
        packagingKind: sourceMeta.packagingKind,
        isBuiltIn: sourceMeta.isBuiltIn,
        lifecycle: "unmanaged" as const,
      };
    });

    return [...configured, ...implicit, ...unmanaged];
  });

export {
  classifyExtensions,
  isIgnoredName,
  type ClassifiedExtension,
  type ClassifierExtensionType,
  type ClassifierInput,
  type PackagingKind,
};
