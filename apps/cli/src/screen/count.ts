/**
 * Count-aware display helper for CLI text.
 *
 * Keeps command output from relying on "(s)" suffixes.
 */
export const count = (n: number, singular: string, plural?: string): string =>
  `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
