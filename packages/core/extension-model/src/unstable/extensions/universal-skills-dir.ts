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
 * WorkspaceMutations-relative path of the universal skills directory.
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
export const stripTrailingSeparators = (p: string): string =>
  p.length > 1 ? p.replace(/[/\\]+$/, "") : p;

/**
 * Returns `true` when `dir` is the workspace-relative universal skills
 * directory path. Use for descriptor-level comparisons where paths are
 * relative (e.g., `agent.skills.dir`).
 *
 * @see {@link isUniversalSkillsDir} for absolute resolved-path comparisons
 * (e.g., after `resolveEffectiveSkillsDir`).
 */
export const isUniversalSkillsRelativeDir = (dir: string): boolean => dir === UNIVERSAL_SKILLS_DIR;

/**
 * Resolve per-agent artifact presence when some agents share the universal
 * skills directory. If any agent in `universalAgentIds` has the artifact,
 * all agents in that set are treated as having it — because the directory
 * is shared, one symlink/copy satisfies them all.
 *
 * Returns the input unchanged when `universalAgentIds` is empty.
 */
export const resolveUniversalDirPresence = <
  T extends { readonly agentId: string; readonly exists: boolean },
>(
  perAgent: ReadonlyArray<T>,
  universalAgentIds: ReadonlySet<string>,
): ReadonlyArray<T> => {
  if (universalAgentIds.size === 0) {
    return perAgent;
  }
  const anyUniversalExists = perAgent.some((p) => p.exists && universalAgentIds.has(p.agentId));
  if (!anyUniversalExists) {
    return perAgent;
  }
  return perAgent.map((p) => (universalAgentIds.has(p.agentId) ? { ...p, exists: true } : p));
};

/**
 * Returns `true` when `resolvedDir` points to the universal skills directory
 * (`<workspaceRoot>/.agents/skills`).
 *
 * Both paths are normalized by stripping trailing separators before comparison.
 *
 * Intended for comparing resolved absolute paths from `resolveEffectiveSkillsDir`.
 * For descriptor-level relative paths, use {@link isUniversalSkillsRelativeDir}.
 */
export const isUniversalSkillsDir = (resolvedDir: string, workspaceRoot: string): boolean => {
  const sep = "/";
  const expected = stripTrailingSeparators(
    `${stripTrailingSeparators(workspaceRoot)}${sep}${UNIVERSAL_SKILLS_DIR}`,
  );
  return stripTrailingSeparators(resolvedDir) === expected;
};
