/**
 * Type-safe object utilities.
 *
 * Provides typed wrappers around Object.entries and Object.fromEntries
 * that preserve key type information.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Type-safe Object.entries that preserves key types.
 *
 * @param obj - Object to get entries from
 * @returns Array of [key, value] tuples with preserved key type
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { typedEntries } from "@agentxm/core/experimental/object";
 *
 * const obj: Record<"a" | "b", number> = { a: 1, b: 2 };
 * const entries = typedEntries(obj);
 * // => [["a", 1], ["b", 2]] with type ["a" | "b", number][]
 * ```
 */
export const typedEntries = <K extends string, V>(obj: Record<K, V>): [K, V][] =>
  Object.entries(obj) as [K, V][];

/**
 * Type-safe Object.fromEntries that preserves key types.
 *
 * @param entries - Array of [key, value] tuples
 * @returns Record with preserved key type
 *
 * @experimental This API is unstable and may change without notice.
 *
 * @example
 * ```typescript
 * import { typedFromEntries } from "@agentxm/core/experimental/object";
 *
 * const entries = [["a", 1], ["b", 2]] as const;
 * const obj = typedFromEntries(entries);
 * // => { a: 1, b: 2 } with type Record<"a" | "b", number>
 * ```
 */
export const typedFromEntries = <K extends string, V>(
  entries: readonly (readonly [K, V])[],
): Record<K, V> => Object.fromEntries(entries) as Record<K, V>;
