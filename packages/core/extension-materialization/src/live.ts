/**
 * Environment-backed layers of the materialization capability: the seven
 * per-extension-type manager implementations behind their service tags, and
 * their registration as `workspace-projection` participants. Only application
 * composition roots import this module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { HookManagerLive } from "./hooks/manager.js";
export { RuleManagerLive } from "./rules/manager.js";
export { SkillManagerLive } from "./skills/manager.js";
export { SubagentManagerLive } from "./subagents/manager.js";
export { McpServerManagerLive } from "./mcps/manager.js";
export { PackManagerLive } from "./packs/manager.js";
export { KnowledgeManagerLive } from "./knowledge/manager.js";
export { ProjectionParticipantsLive } from "./projection-participants-live.js";
export { ExtensionManagersLive } from "./manager-registry-live.js";
