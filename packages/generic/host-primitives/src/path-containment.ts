/**
 * Lexical path containment shared by AXM tiers. The rule reads path strings
 * only, so callers that need the physical location resolve links first.
 */

import type * as Path from "effect/Path";

/**
 * Whether `relative`, a `path.relative(parent, child)` result, stays inside
 * `parent`. The empty path is the parent itself, and a child whose name merely
 * starts with `..` (such as `..cache`) is inside.
 */
export const isRelativeWithin = (
  path: Pick<Path.Path, "isAbsolute" | "sep">,
  relative: string,
): boolean =>
  !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);

/** Options for `isLexicallyWithin`. */
export interface LexicalContainmentOptions {
  /** Whether a child equal to the parent counts as within. Defaults to `true`. */
  readonly includeSelf?: boolean;
  /**
   * On Windows, compare the resolved paths as exact prefixes instead of
   * through `path.relative`, which folds case. Use it where the parent is a
   * capability prefix rather than any spelling of a live directory.
   */
  readonly windowsPrefix?: boolean;
}

/** Whether `child` lies inside `parent` after both are resolved. */
export const isLexicallyWithin = (
  path: Path.Path,
  parent: string,
  child: string,
  options: LexicalContainmentOptions = {},
): boolean => {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  const includeSelf = options.includeSelf ?? true;
  if (options.windowsPrefix === true && path.sep === "\\") {
    if (target === root) return includeSelf;
    return target.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
  }
  const relative = path.relative(root, target);
  return relative === "" ? includeSelf : isRelativeWithin(path, relative);
};
