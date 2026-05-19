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

import type { SkillExtensionRef } from "../skills/refs.js";
import type { CommandExtensionRef } from "../commands/refs.js";
import type { McpServerExtensionRef } from "../mcp-servers/refs.js";
import type { SubagentExtensionRef } from "../subagents/refs.js";
import type { ContextFilesExtensionRef } from "../context-files/refs.js";
import type { PackRef } from "../packs/refs.js";

/** @experimental */
export type ExtensionRef =
  | SkillExtensionRef
  | CommandExtensionRef
  | McpServerExtensionRef
  | SubagentExtensionRef
  | ContextFilesExtensionRef
  | PackRef;
