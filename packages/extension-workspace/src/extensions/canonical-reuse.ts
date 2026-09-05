/**
 * Reuse decision for registry canonical trees.
 *
 * Archive integrity is a download-time supply-chain guarantee: the SRI hash
 * in the lockfile is verified against fetched archive bytes before
 * extraction. After install, canonical content is workspace-owned —
 * content-preserving workspace tools (formatters, line-ending
 * normalization) may rewrite installed files, and a no-op install must not
 * revert them by re-extracting the archive.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Decide whether a registry install may reuse the existing canonical tree
 * instead of re-downloading and re-extracting the archive.
 *
 * `canonicalExists` must describe the canonical installed tree. Probing a
 * staging destination instead makes it permanently false, which silently
 * defeats the reuse contract above; prefer `canReuseInstalledPackage`, which
 * takes the installed path by name.
 *
 * - `force` always re-materializes (the internal repair path for `--reinstall` installs
 *   and lint autofix reinstalls).
 * - Refs without integrity (synthetic refs from publish) reuse an existing
 *   tree, preserving the historical publish behavior.
 * - Refs with integrity reuse the tree only when the lockfile already pins
 *   the requested version, so version changes still re-materialize.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const shouldReuseCanonicalInstall = (args: {
  /** The canonical extension directory already exists on disk. */
  readonly canonicalExists: boolean;
  /** Caller demanded an unconditional re-materialization. */
  readonly force: boolean;
  /** The ref carries a pinned archive integrity (registry-resolved). */
  readonly hasIntegrity: boolean;
  /** Exact version requested by the ref being installed. */
  readonly refVersion: string | undefined;
  /** Resolved version recorded in the current lockfile entry, when any. */
  readonly lockedVersion: string | undefined;
}): boolean => {
  if (!args.canonicalExists || args.force) return false;
  if (!args.hasIntegrity) return true;
  return args.refVersion !== undefined && args.refVersion === args.lockedVersion;
};
