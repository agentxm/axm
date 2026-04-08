/**
 * Intent type for the subagent uninstall command workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Describes the resolved intent to uninstall one or more subagents.
 *
 * Produced by `finalizeIntent` after parsing and glob expansion.
 * Consumed by `buildUninstallPlan`.
 */
export type UninstallSubagentCommandIntent = {
  readonly subagentsToUninstall: ReadonlyArray<{ readonly subagentName: string }>;
};
