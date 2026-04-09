/**
 * Tool access mapping for subagent rendering.
 *
 * Maps portable `toolAccess` values to agent-native tool control fields.
 * Returns an object of fields to merge into the rendered output.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { LossyRenderingWarning } from "../../commands/rendering-warnings.js";
import type { ToolAccessLevel } from "../tool-access.js";

/**
 * Result of mapping a portable tool access level to agent-native fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ToolAccessMappingResult {
  /** Agent-native fields to merge into the rendered output. */
  readonly fields: Readonly<Record<string, unknown>>;
  /** Optional warnings for lossy mappings. */
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Per-agent tool access mapping definitions.
 */
const TOOL_ACCESS_TABLE: Readonly<
  Record<string, Readonly<Record<ToolAccessLevel, ToolAccessMappingResult>>>
> = {
  "claude-code": {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { disallowedTools: "Edit,Write,Bash" },
      warnings: [],
    },
    none: {
      fields: { tools: "" },
      warnings: [],
    },
  },
  "github-copilot": {
    full: { fields: { tools: ["*"] }, warnings: [] },
    readonly: {
      fields: { tools: ["read", "search"] },
      warnings: [],
    },
    none: {
      fields: { tools: [] },
      warnings: [],
    },
  },
  codex: {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { sandbox_mode: "read-only" },
      warnings: [],
    },
    none: {
      fields: { sandbox_mode: "read-only" },
      warnings: [
        {
          agent: "codex",
          feature: "toolAccess",
          message:
            'Codex does not distinguish "none" from "readonly"; both map to sandbox_mode = "read-only"',
        },
      ],
    },
  },
  cursor: {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { readonly: true },
      warnings: [],
    },
    none: {
      fields: { readonly: true },
      warnings: [
        {
          agent: "cursor",
          feature: "toolAccess",
          message: 'Cursor does not distinguish "none" from "readonly"; both map to readonly: true',
        },
      ],
    },
  },
  "gemini-cli": {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { tools: ["read_file", "list_dir", "grep_search", "web_search"] },
      warnings: [],
    },
    none: {
      fields: { tools: [] },
      warnings: [],
    },
  },
  opencode: {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { permission: { edit: "deny", bash: "deny" } },
      warnings: [],
    },
    none: {
      fields: { permission: { edit: "deny", bash: "deny", task: "deny" } },
      warnings: [],
    },
  },
  augment: {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: {
        disabled_tools: ["str-replace-editor", "save-file", "remove-files", "launch-process"],
      },
      warnings: [],
    },
    none: {
      fields: { tools: [] },
      warnings: [],
    },
  },
  junie: {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { disallowedTools: ["Write", "Edit", "Bash"] },
      warnings: [],
    },
    none: {
      fields: { tools: [] },
      warnings: [],
    },
  },
  "kilo-code": {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { permission: { edit: "deny", bash: "deny" } },
      warnings: [],
    },
    none: {
      fields: { permission: { edit: "deny", bash: "deny", task: "deny" } },
      warnings: [],
    },
  },
  kiro: {
    full: { fields: {}, warnings: [] },
    readonly: {
      fields: { tools: ["read", "web"] },
      warnings: [],
    },
    none: {
      fields: { tools: [] },
      warnings: [],
    },
  },
  "roo-code": {
    full: {
      fields: { groups: ["read", "edit", "command", "mcp"] },
      warnings: [],
    },
    readonly: {
      fields: { groups: ["read", "mcp"] },
      warnings: [],
    },
    none: {
      fields: { groups: ["read"] },
      warnings: [],
    },
  },
};

/**
 * Map a portable tool access level to agent-native fields.
 *
 * Returns fields to merge into the rendered output and any warnings
 * for lossy mappings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mapToolAccess = (
  toolAccess: ToolAccessLevel | undefined,
  agentId: string,
): ToolAccessMappingResult => {
  const level = toolAccess ?? "full";
  const agentTable = TOOL_ACCESS_TABLE[agentId];

  if (agentTable === undefined) {
    // Unknown agent — default to no fields
    return { fields: {}, warnings: [] };
  }

  return agentTable[level];
};
