/**
 * Pure functions for skills state management.
 *
 * These functions are pure (no side effects) and can be tested without effects.
 * They compute derived values from state without modifying anything.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as semver from "semver";
import type { SourceInput } from "../../../sources/types.js";

/**
 * Skill source type re-exported from sources/types.ts for convenience.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillSource = SourceInput;

// =============================================================================
// Install Path Computation
// =============================================================================

/**
 * Compute install path from source type and skill name.
 *
 * All skills are installed to: `.axm/extensions/external/skills/<name>`
 *
 * @param _source - The skill source (currently unused — all sources use the same path)
 * @param name - The skill name to use in the path
 * @returns The relative install path for the skill
 *
 * @example
 * ```typescript
 * computeInstallPath(source, "my-skill");
 * // => ".axm/extensions/external/skills/my-skill"
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeInstallPath = (_source: SkillSource, name: string): string =>
  `.axm/extensions/external/skills/${name}`;

// =============================================================================
// Version Comparison
// =============================================================================

/**
 * Compare two optional version strings for equality.
 *
 * This function handles version comparison with the following logic:
 * - If both are None, they're equal (returns true)
 * - If one is None and one is Some, they're not equal (returns false)
 * - If both are Some, attempt semver comparison first:
 *   - If both parse as valid semver, use semver.eq() for comparison
 *   - If either fails to parse as semver, fall back to string equality
 *
 * This is useful for comparing versions from different source types:
 * - Registry sources use semver (e.g., "1.0.0", "2.1.0-beta.1")
 * - Git sources may use non-semver identifiers (e.g., git tree hashes)
 *
 * @param a - First optional version string
 * @param b - Second optional version string
 * @returns true if versions are equal, false otherwise
 *
 * @example
 * ```typescript
 * import { Option } from "effect";
 *
 * // Both None - equal
 * versionsEqual(Option.none(), Option.none()); // true
 *
 * // One None - not equal
 * versionsEqual(Option.some("1.0.0"), Option.none()); // false
 *
 * // Both valid semver - uses semver comparison
 * versionsEqual(Option.some("1.0.0"), Option.some("1.0.0")); // true
 * versionsEqual(Option.some("1.0.0+build1"), Option.some("1.0.0+build2")); // true (build metadata ignored)
 *
 * // Non-semver strings - falls back to string equality
 * versionsEqual(Option.some("abc123"), Option.some("abc123")); // true
 * versionsEqual(Option.some("abc123"), Option.some("def456")); // false
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const versionsEqual = (a: Option.Option<string>, b: Option.Option<string>): boolean =>
  pipe(
    Option.all([a, b]),
    Option.match({
      onNone: () => Option.isNone(a) && Option.isNone(b),
      onSome: ([va, vb]) => {
        // Attempt semver comparison, fall back to string equality
        const parsedA = semver.parse(va);
        const parsedB = semver.parse(vb);
        return parsedA && parsedB ? semver.eq(parsedA, parsedB) : va === vb;
      },
    }),
  );
