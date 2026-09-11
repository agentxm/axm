/**
 * The vocabulary every uninstall route shares.
 *
 * Root uninstall and the seven per-type uninstalls are one use case with the
 * type either fixed by the command or read from the registry FQN, so they
 * share one settled target list and one disposition vocabulary. What a
 * removal actually did — removed the package, retained it for a pack, left
 * unowned content in place, or found nothing at all — is reported as a typed
 * settlement rather than inferred from a sentence.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  HookExtensionTarget,
  KnowledgeExtensionTarget,
  McpServerExtensionTarget,
  PackExtensionTarget,
  RuleExtensionTarget,
  SkillExtensionTarget,
  SubagentExtensionTarget,
} from "@agentxm/workspace-state";

/** One skill removal. */
export interface SkillUninstallIntent {
  readonly targets: ReadonlyArray<SkillExtensionTarget>;
}

/** One subagent removal. */
export interface SubagentUninstallIntent {
  readonly targets: ReadonlyArray<SubagentExtensionTarget>;
}

/** One MCP connection removal. */
export interface McpServerUninstallIntent {
  readonly targets: ReadonlyArray<McpServerExtensionTarget>;
}

/** One rule removal. */
export interface RuleUninstallIntent {
  readonly targets: ReadonlyArray<RuleExtensionTarget>;
}

/** One hooks-package removal. */
export interface HookUninstallIntent {
  readonly targets: ReadonlyArray<HookExtensionTarget>;
}

/** One knowledge-bundle removal. */
export interface KnowledgeUninstallIntent {
  readonly targets: ReadonlyArray<KnowledgeExtensionTarget>;
}

/** One pack removal, with the owner and authority its desired identity named. */
export type PackUninstallTarget = PackExtensionTarget;
