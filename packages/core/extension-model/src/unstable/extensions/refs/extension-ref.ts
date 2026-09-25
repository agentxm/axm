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

import type { ExtensionName } from "../common.js";
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

/**
 * The name an extension's own manifest gives it: the configured workspace
 * name it occupies. A Registry ref's `name` is the package the Registry
 * serves it under and may differ; Registry operations use that one.
 *
 * @experimental
 */
export const extensionRefName = (ref: ExtensionRef): ExtensionName => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "mcp-server":
      return ref.server.name;
    case "pack":
      return ref.pack.name;
    case "subagent":
      return ref.subagent.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
  }
};
