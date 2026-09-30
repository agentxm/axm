/**
 * Universal skills directory convention.
 *
 * The universal skills directory (`.agents/skills`) is a shared cross-agent
 * convention used by multiple coding agents. Skills placed here are visible to
 * every agent that opts in, rather than being scoped to a single agent's
 * configuration directory.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * Workspace-relative path of the universal skills directory.
 */
export const UNIVERSAL_SKILLS_DIR = ".agents/skills";

/**
 * First path segment of {@link UNIVERSAL_SKILLS_DIR}.
 *
 * Used by detection and lint logic to exclude the universal directory from
 * agent-specific filesystem probes.
 */
export const UNIVERSAL_SKILLS_DIR_SEGMENT: string = UNIVERSAL_SKILLS_DIR.split("/")[0] ?? "";

/**
 * Strips trailing path separators from a path string.
 */
export const stripTrailingSeparators = (path: string): string => {
  let end = path.length;
  while (end > 1 && (path[end - 1] === "/" || path[end - 1] === "\\")) {
    end -= 1;
  }
  return path.slice(0, end);
};

/**
 * Returns `true` when `resolvedDir` points to the universal skills directory
 * (`<workspaceRoot>/.agents/skills`).
 *
 * Both paths are normalized by stripping trailing separators before comparison.
 *
 * Intended for comparing resolved absolute paths from `resolveEffectiveSkillsDir`.
 */
export const isUniversalSkillsDir = (resolvedDir: string, workspaceRoot: string): boolean => {
  const sep = "/";
  const expected = stripTrailingSeparators(
    `${stripTrailingSeparators(workspaceRoot)}${sep}${UNIVERSAL_SKILLS_DIR}`,
  );
  return stripTrailingSeparators(resolvedDir) === expected;
};
