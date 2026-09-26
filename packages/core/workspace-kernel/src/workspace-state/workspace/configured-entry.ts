/**
 * Shared helpers for configured extension entries.
 *
 * @experimental This API is unstable and may change without notice.
 */

export interface ConfiguredEntryEnabledState {
  /** Omitted on a Pack-member configuration entry that inherits activation. */
  readonly enabled?: boolean | undefined;
}

/** A configuration-only entry that omits `enabled` inherits an active member. */
export const isConfiguredEntryEnabled = (entry: ConfiguredEntryEnabledState): boolean =>
  entry.enabled !== false;

export const enabledConfiguredEntries = <TEntry extends ConfiguredEntryEnabledState>(
  entries: Readonly<Record<string, TEntry>>,
): ReadonlyArray<readonly [string, TEntry]> =>
  Object.entries(entries).filter(([, entry]) => isConfiguredEntryEnabled(entry));

/** An entry that declares acquisition: it names a source the workspace resolves. */
export interface ConfiguredEntryAcquisitionState extends ConfiguredEntryEnabledState {
  readonly kind?: "sourced" | "inline" | "configuration" | undefined;
}

/**
 * The enabled entries that declare acquisition.
 *
 * A Pack-member configuration entry carries preferences only: it is no
 * dependency root, contributes no constraint, and is never a unit an install
 * or update sweep schedules. Acquisition enumeration asks for this list so a
 * preference can never be mistaken for intent to acquire.
 */
export type AcquisitionEntry<TEntry> = Exclude<TEntry, { readonly kind: "configuration" }>;

const isAcquisitionEntry = <TEntry extends ConfiguredEntryAcquisitionState>(
  entry: TEntry,
): entry is AcquisitionEntry<TEntry> => entry.kind !== "configuration";

export const acquisitionConfiguredEntries = <TEntry extends ConfiguredEntryAcquisitionState>(
  entries: Readonly<Record<string, TEntry>>,
): ReadonlyArray<readonly [string, AcquisitionEntry<TEntry>]> =>
  enabledConfiguredEntries(entries).flatMap(([name, entry]) =>
    isAcquisitionEntry(entry) ? [[name, entry] as const] : [],
  );
