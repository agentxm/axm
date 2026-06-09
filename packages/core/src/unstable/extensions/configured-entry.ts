/**
 * Shared helpers for configured extension entries.
 *
 * @experimental This API is unstable and may change without notice.
 */

export interface ConfiguredEntryEnabledState {
  readonly enabled: boolean;
}

export const isConfiguredEntryEnabled = (entry: ConfiguredEntryEnabledState): boolean =>
  entry.enabled;

export const enabledConfiguredEntries = <TEntry extends ConfiguredEntryEnabledState>(
  entries: Readonly<Record<string, TEntry>>,
): ReadonlyArray<readonly [string, TEntry]> =>
  Object.entries(entries).filter(([, entry]) => isConfiguredEntryEnabled(entry));
