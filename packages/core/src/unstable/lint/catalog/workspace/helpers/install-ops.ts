/**
 * Helpers for emitting the per-extension Operation values used by the
 * workspace autofix rules.
 *
 * Autofix `fix` methods compose from the Operation vocabulary. Wiring to the canonical `OperationHandler`
 * registry (which expects fully-resolved `SkillExtensionRef` / `PackRef`
 * values) happens at the CLI layer (Phase 5); at the lint layer we emit the
 * Operation **intent** — minimal args capturing what reinstall / uninstall /
 * enable / disable means for a named extension. The determinism harness
 * interprets these intents against an in-memory state model.
 *
 * Shape consistency matters: the args shape below is the contract the
 * harness interprets. Phase 5's CLI adapter lowers these intents into the
 * fully-resolved Operation values the handlers expect.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Operation } from "../../../../plan/plan.js";
import type { Settings } from "../../../../settings/schema.js";

// -----------------------------------------------------------------------------
// Lint-Operation intent args
// -----------------------------------------------------------------------------

/**
 * Install-skill intent emitted by an autofixing workspace rule.
 *
 * - `name` — lockfile key (and sanitized filesystem name).
 * - `source` — source string from settings (e.g. `@acme/skills/axm`).
 * - `force` — when `true`, the handler reinstalls unconditionally (used by
 *   integrity + artifact-clean dangling arms).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface InstallSkillIntent {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

/** @experimental */
export interface UninstallSkillIntent {
  readonly name: string;
}

/** @experimental */
export interface EnableSkillIntent {
  readonly name: string;
}

/** @experimental */
export interface DisableSkillIntent {
  readonly name: string;
}

/** @experimental */
export interface InstallPackIntent {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

/** @experimental */
export interface UninstallPackIntent {
  readonly name: string;
}

/** @experimental */
export interface InstallMcpServerIntent {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

/** @experimental */
export interface UninstallMcpServerIntent {
  readonly name: string;
}

/** @experimental */
export interface EnableSubagentIntent {
  readonly name: string;
}

/** @experimental */
export interface DisableSubagentIntent {
  readonly name: string;
}

/** @experimental */
export interface InstallSubagentIntent {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

/** @experimental */
export interface UninstallSubagentIntent {
  readonly name: string;
}

/** @experimental */
export interface InstallRuleIntent {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

/** @experimental */
export interface UninstallRuleIntent {
  readonly name: string;
}

/** @experimental */
export interface EnableRuleIntent {
  readonly name: string;
}

/** @experimental */
export interface DisableRuleIntent {
  readonly name: string;
}

/** @experimental */
export interface InstallHookIntent {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

/** @experimental */
export interface UninstallHookIntent {
  readonly name: string;
}

/** @experimental */
export interface EnableHookIntent {
  readonly name: string;
}

/** @experimental */
export interface DisableHookIntent {
  readonly name: string;
}

/** @experimental */
export interface InstallKnowledgeIntent {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

/** @experimental */
export interface UninstallKnowledgeIntent {
  readonly name: string;
}

/** @experimental */
export interface EnableKnowledgeIntent {
  readonly name: string;
}

/** @experimental */
export interface DisableKnowledgeIntent {
  readonly name: string;
}

/** @experimental */
export interface SyncInstructionTargetIntent {
  readonly root: string;
  readonly agentId: string;
  readonly force: boolean;
}

/** @experimental */
export interface SyncInstructionsGitignoreIntent {
  readonly desired: boolean;
}

/** @experimental */
export interface SyncMcpServerAgentIntent {
  readonly serverName: string;
  readonly agentId: string;
  readonly scope: "project" | "user";
  readonly force: boolean;
}

/** @experimental */
export interface RemoveMcpServerAgentIntent {
  readonly serverName: string;
  readonly agentId: string;
  readonly scope: "project" | "user";
}

// -----------------------------------------------------------------------------
// Emit helpers
// -----------------------------------------------------------------------------

export const installSkillOp = (
  intent: InstallSkillIntent,
): Operation<"install-skill", InstallSkillIntent> => ({
  name: "install-skill",
  args: intent,
});

export const uninstallSkillOp = (
  intent: UninstallSkillIntent,
): Operation<"uninstall-skill", UninstallSkillIntent> => ({
  name: "uninstall-skill",
  args: intent,
});

export const enableSkillOp = (
  intent: EnableSkillIntent,
): Operation<"enable-skill", EnableSkillIntent> => ({
  name: "enable-skill",
  args: intent,
});

export const disableSkillOp = (
  intent: DisableSkillIntent,
): Operation<"disable-skill", DisableSkillIntent> => ({
  name: "disable-skill",
  args: intent,
});

export const installPackOp = (
  intent: InstallPackIntent,
): Operation<"install-pack", InstallPackIntent> => ({
  name: "install-pack",
  args: intent,
});

export const uninstallPackOp = (
  intent: UninstallPackIntent,
): Operation<"uninstall-pack", UninstallPackIntent> => ({
  name: "uninstall-pack",
  args: intent,
});

export const installMcpServerOp = (
  intent: InstallMcpServerIntent,
): Operation<"install-mcp-server", InstallMcpServerIntent> => ({
  name: "install-mcp-server",
  args: intent,
});

export const uninstallMcpServerOp = (
  intent: UninstallMcpServerIntent,
): Operation<"uninstall-mcp-server", UninstallMcpServerIntent> => ({
  name: "uninstall-mcp-server",
  args: intent,
});

export const enableSubagentOp = (
  intent: EnableSubagentIntent,
): Operation<"enable-subagent", EnableSubagentIntent> => ({
  name: "enable-subagent",
  args: intent,
});

export const disableSubagentOp = (
  intent: DisableSubagentIntent,
): Operation<"disable-subagent", DisableSubagentIntent> => ({
  name: "disable-subagent",
  args: intent,
});

export const installSubagentOp = (
  intent: InstallSubagentIntent,
): Operation<"install-subagent", InstallSubagentIntent> => ({
  name: "install-subagent",
  args: intent,
});

export const uninstallSubagentOp = (
  intent: UninstallSubagentIntent,
): Operation<"uninstall-subagent", UninstallSubagentIntent> => ({
  name: "uninstall-subagent",
  args: intent,
});

export const installRuleOp = (
  intent: InstallRuleIntent,
): Operation<"install-rule", InstallRuleIntent> => ({
  name: "install-rule",
  args: intent,
});

export const uninstallRuleOp = (
  intent: UninstallRuleIntent,
): Operation<"uninstall-rule", UninstallRuleIntent> => ({
  name: "uninstall-rule",
  args: intent,
});

export const enableRuleOp = (
  intent: EnableRuleIntent,
): Operation<"enable-rule", EnableRuleIntent> => ({
  name: "enable-rule",
  args: intent,
});

export const disableRuleOp = (
  intent: DisableRuleIntent,
): Operation<"disable-rule", DisableRuleIntent> => ({
  name: "disable-rule",
  args: intent,
});

export const installHookOp = (
  intent: InstallHookIntent,
): Operation<"install-hook", InstallHookIntent> => ({
  name: "install-hook",
  args: intent,
});

export const uninstallHookOp = (
  intent: UninstallHookIntent,
): Operation<"uninstall-hook", UninstallHookIntent> => ({
  name: "uninstall-hook",
  args: intent,
});

export const enableHookOp = (
  intent: EnableHookIntent,
): Operation<"enable-hook", EnableHookIntent> => ({
  name: "enable-hook",
  args: intent,
});

export const disableHookOp = (
  intent: DisableHookIntent,
): Operation<"disable-hook", DisableHookIntent> => ({
  name: "disable-hook",
  args: intent,
});

export const installKnowledgeOp = (
  intent: InstallKnowledgeIntent,
): Operation<"install-knowledge", InstallKnowledgeIntent> => ({
  name: "install-knowledge",
  args: intent,
});

export const uninstallKnowledgeOp = (
  intent: UninstallKnowledgeIntent,
): Operation<"uninstall-knowledge", UninstallKnowledgeIntent> => ({
  name: "uninstall-knowledge",
  args: intent,
});

export const enableKnowledgeOp = (
  intent: EnableKnowledgeIntent,
): Operation<"enable-knowledge", EnableKnowledgeIntent> => ({
  name: "enable-knowledge",
  args: intent,
});

export const disableKnowledgeOp = (
  intent: DisableKnowledgeIntent,
): Operation<"disable-knowledge", DisableKnowledgeIntent> => ({
  name: "disable-knowledge",
  args: intent,
});

export const syncInstructionTargetOp = (
  intent: SyncInstructionTargetIntent,
): Operation<"sync-instruction-target", SyncInstructionTargetIntent> => ({
  name: "sync-instruction-target",
  args: intent,
});

export const syncInstructionsGitignoreOp = (
  intent: SyncInstructionsGitignoreIntent,
): Operation<"sync-instructions-gitignore", SyncInstructionsGitignoreIntent> => ({
  name: "sync-instructions-gitignore",
  args: intent,
});

export const syncMcpServerAgentOp = (
  intent: SyncMcpServerAgentIntent,
): Operation<"sync-mcp-server-agent", SyncMcpServerAgentIntent> => ({
  name: "sync-mcp-server-agent",
  args: intent,
});

export const removeMcpServerAgentOp = (
  intent: RemoveMcpServerAgentIntent,
): Operation<"remove-mcp-server-agent", RemoveMcpServerAgentIntent> => ({
  name: "remove-mcp-server-agent",
  args: intent,
});

// -----------------------------------------------------------------------------
// Vocabulary guard — the canonical operation vocabulary.
// -----------------------------------------------------------------------------

/**
 * The per-extension Operation names lint autofix is allowed to emit.
 *
 * The guard test (`workspace-guard.test.ts`, task 3c.29) asserts no
 * autofixing workspace rule emits an Operation outside this set and that
 * no rule body references `syncWorkspace()` or a similar top-level
 * reconcile entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PER_EXTENSION_OPERATION_NAMES = [
  "install-skill",
  "uninstall-skill",
  "enable-skill",
  "disable-skill",
  "install-pack",
  "uninstall-pack",
  "install-mcp-server",
  "uninstall-mcp-server",
  "install-subagent",
  "uninstall-subagent",
  "enable-subagent",
  "disable-subagent",
  "install-rule",
  "uninstall-rule",
  "enable-rule",
  "disable-rule",
  "install-hook",
  "uninstall-hook",
  "enable-hook",
  "disable-hook",
  "install-knowledge",
  "uninstall-knowledge",
  "enable-knowledge",
  "disable-knowledge",
  "sync-instruction-target",
  "sync-instructions-gitignore",
  "sync-mcp-server-agent",
  "remove-mcp-server-agent",
] as const;

/** @experimental */
export type PerExtensionOperationName = (typeof PER_EXTENSION_OPERATION_NAMES)[number];

const PER_EXTENSION_OPERATION_SET: ReadonlySet<string> = new Set(PER_EXTENSION_OPERATION_NAMES);

/** @experimental */
export const isPerExtensionOperationName = (name: string): name is PerExtensionOperationName =>
  PER_EXTENSION_OPERATION_SET.has(name);

// -----------------------------------------------------------------------------
// Bulk emitters
// -----------------------------------------------------------------------------

/**
 * Emit one `install-{type}` Operation per declared entry in `settings`, across
 * every installable type. Used by `workspace/lockfile-valid`'s missing-arm
 * autofix — each declaration produces a reinstall intent, and the handler
 * side-effects recreate the lockfile.
 *
 * All installable families participate so `axm lint --fix` rebuilds a complete lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collectMissingLockfileInstallOps = (
  settings: Settings,
): ReadonlyArray<Operation<string, unknown>> => {
  const ops: Array<Operation<string, unknown>> = [];
  for (const [name, entry] of Object.entries(settings.skills ?? {})) {
    ops.push(installSkillOp({ name, source: entry.source, force: false }));
  }
  for (const [name, entry] of Object.entries(settings.packs ?? {})) {
    ops.push(installPackOp({ name, source: entry.source, force: false }));
  }
  for (const [name, entry] of Object.entries(settings.subagents ?? {})) {
    ops.push(installSubagentOp({ name, source: entry.source, force: false }));
  }
  for (const [name, entry] of Object.entries(settings.mcpServers ?? {})) {
    ops.push(installMcpServerOp({ name, source: entry.source, force: false }));
  }
  for (const [name, entry] of Object.entries(settings.rules ?? {})) {
    ops.push(installRuleOp({ name, source: entry.source, force: false }));
  }
  for (const [name, entry] of Object.entries(settings.hooks ?? {})) {
    ops.push(installHookOp({ name, source: entry.source, force: false }));
  }
  for (const [name, entry] of Object.entries(settings.knowledge ?? {})) {
    ops.push(installKnowledgeOp({ name, source: entry.source, force: false }));
  }
  return ops;
};
