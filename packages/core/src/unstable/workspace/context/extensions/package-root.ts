/**
 * Internal helper for computing ancestor paths from scanner-emitted
 * `pathSegments` + `contentLocation` without re-introducing a `Path` service
 * dependency in subject modules.
 *
 * The canonical-extensions scanner already splits `contentLocation` into
 * `pathSegments` via the `Path` service. This helper inverts that: it derives
 * the platform separator from the relationship between the segments and the
 * original string, then joins a prefix back to a path.
 *
 * Why this exists: subject modules need `packageRoot` (the parent or
 * grandparent directory of `contentLocation`). They never see the `Path`
 * service — that lives at the live-layer construction boundary. The scanner's
 * `pathSegments` field carries enough structure to reconstruct any ancestor.
 *
 * Cross-platform behavior:
 *
 * - POSIX `/ws/.axm/extensions/@o/skills/src/x` →
 *   `pathSegments = ["", "ws", ".axm", "extensions", "@o", "skills", "src", "x"]`.
 *   `pathSegments[0]` is `""`; the separator is `contentLocation.charAt(0) = "/"`.
 *   Joining `pathSegments.slice(0, -2)` with `/` yields
 *   `/ws/.axm/extensions/@o/skills`.
 * - Windows `C:\\ws\\.axm\\extensions\\@o\\skills\\src\\x` →
 *   `pathSegments = ["C:", "ws", ".axm", "extensions", "@o", "skills", "src", "x"]`.
 *   `pathSegments[0]` is `"C:"` (length 2); the separator is
 *   `contentLocation.charAt(2) = "\\"`. Joining yields
 *   `C:\\ws\\.axm\\extensions\\@o\\skills`.
 */

/**
 * Drop the trailing `count` segments from `pathSegments` and rejoin the
 * remainder with the separator inferred from `contentLocation`. Returns the
 * empty string if all segments would be dropped.
 */
export const stripTrailingSegments = (
  pathSegments: ReadonlyArray<string>,
  contentLocation: string,
  count: number,
): string => {
  if (pathSegments.length <= count) return "";
  const sep = contentLocation.charAt(pathSegments[0]?.length ?? 0);
  return pathSegments.slice(0, pathSegments.length - count).join(sep);
};
