/**
 * Intent type for the skill uninstall command workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Describes the resolved intent to uninstall one or more skills.
 *
 * Produced by `finalizeSkillUninstallIntent` after parsing and glob expansion.
 * Consumed by `buildSkillUninstallPlan`.
 */
export type UninstallSkillCommandIntent = {
  readonly skillsToUninstall: ReadonlyArray<{ readonly skillName: string }>;
};
