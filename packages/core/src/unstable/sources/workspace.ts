/**
 * Return whether a configured source string declares intrinsic workspace
 * authority.
 *
 * This is the single classification predicate lifecycle guards use. Parsing
 * and identity validation remain separate so malformed workspace locators are
 * still classified as workspace-owned and cannot fall through to a remote
 * source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const isWorkspaceSourceLocator = (source: string): boolean => source === "workspace";
