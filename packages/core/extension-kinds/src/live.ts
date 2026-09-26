/**
 * Environment-backed layers of the seven extension kinds: each kind's manager
 * behind the kernel's manager tag, and the system keychain behind the kernel's
 * MCP credential port. Only composition roots import this module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

import * as Layer from "effect/Layer";
import { HookManagerLive } from "./hooks/live.js";
import { RuleManagerLive } from "./instructions/live.js";
import { KnowledgeManagerLive } from "./knowledge/live.js";
import { McpSecretStoreLive, McpServerManagerLive } from "./mcp-connections/live.js";
import { PackManagerLive } from "./packs/live.js";
import { SkillManagerLive } from "./skills/live.js";
import { SubagentManagerLive } from "./subagents/live.js";

export {
  HookManagerLive,
  KnowledgeManagerLive,
  McpSecretStoreLive,
  McpServerManagerLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
};

/**
 * Every kind's manager and the MCP credential store, as a composition root
 * provides them. Leaf managers are independent; the Pack manager drives its
 * members through them.
 */
export const ExtensionKindsLive = Layer.merge(
  Layer.provideMerge(
    PackManagerLive,
    Layer.mergeAll(
      RuleManagerLive,
      HookManagerLive,
      McpServerManagerLive,
      SkillManagerLive,
      SubagentManagerLive,
      KnowledgeManagerLive,
    ),
  ),
  McpSecretStoreLive,
);
