/**
 * Extension ref union assembler.
 *
 * Imports per-type concrete refs from feature folders and defines the
 * unified `ExtensionRef` union. This file is a leaf — feature folders
 * import only from `ref-base.ts`, never from this file.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { SkillExtensionRef } from "./skill.js";
import type { McpServerExtensionRef } from "./mcp-server.js";
import type { SubagentExtensionRef } from "./subagent.js";
import type { RuleExtensionRef } from "./rule.js";
import type { HookExtensionRef } from "./hook.js";
import type { KnowledgeExtensionRef } from "./knowledge.js";
import type { PackRef } from "./pack.js";

/** @experimental */
export type ExtensionRef =
  | SkillExtensionRef
  | McpServerExtensionRef
  | SubagentExtensionRef
  | RuleExtensionRef
  | HookExtensionRef
  | KnowledgeExtensionRef
  | PackRef;
