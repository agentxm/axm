export type ReleaseChecksumSelection =
  | { readonly valid: true; readonly sha256Hex: string }
  | { readonly valid: false; readonly detail: string };

/** Every manifest entry must be valid, and exactly one must identify the selected binary. */
export const selectReleaseChecksum = (
  manifest: string,
  binaryName: string,
): ReleaseChecksumSelection => {
  const entries = manifest
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => /^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/u.exec(line));
  if (entries.some((entry) => entry === null)) {
    return { valid: false, detail: "SHA256SUMS contains a malformed entry" };
  }
  const matches = entries.filter((entry) => entry?.[2] === binaryName);
  if (matches.length !== 1 || matches[0]?.[1] === undefined) {
    return { valid: false, detail: `SHA256SUMS must contain exactly one entry for ${binaryName}` };
  }
  return { valid: true, sha256Hex: matches[0][1] };
};

/** An unknown prior version can only establish successful execution after restoration. */
export const acceptsScriptExecutable = (
  observed: { readonly exitCode: number | null; readonly reportedVersion: string | null },
  expectedVersion: string | null,
): boolean =>
  observed.exitCode === 0 &&
  (expectedVersion === null || observed.reportedVersion === expectedVersion);
