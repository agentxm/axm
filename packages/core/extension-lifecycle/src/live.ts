/**
 * Environment-backed layers of the extension-lifecycle feature: the seven
 * per-type manager implementations behind the extension-workspace manager
 * contracts, and the hook-backed configured-agent-outcomes provider. Only
 * application composition roots import this module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { HookManagerLive } from "./hooks/manager.js";
export { HookConfiguredAgentOutcomesProviderLive } from "./hooks/configured-agent-outcomes-provider.js";
export { RuleManagerLive } from "./rules/manager.js";
export { SkillManagerLive } from "./skills/manager.js";
export { SubagentManagerLive } from "./subagents/manager.js";
export { McpServerManagerLive } from "./mcps/manager.js";
export { PackManagerLive } from "./packs/manager.js";
export { KnowledgeManagerLive } from "./knowledge/manager.js";
