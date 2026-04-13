import type * as Option from "effect/Option";
import type { CommandExtensionRef } from "../../commands/index.js";
import type { AppError } from "../../app-error/index.js";
import type { McpServerExtensionRef } from "../../mcp-servers/index.js";
import type { ExtensionPackRef } from "../../packs/index.js";
import type { SkillExtensionRef } from "../../skills/index.js";
import type { SubagentExtensionRef } from "../../subagents/index.js";
import type { VersionConstraint } from "../../version-constraints/version-constraints.js";

export type ConfiguredEntryFailureReason =
  | "entry-malformed"
  | "source-not-found"
  | "source-multiple-matches"
  | "source-resolution-failed"
  | "source-timeout";

export interface ResolvedConfiguredEntry<TRef> {
  readonly ref: TRef;
  readonly versionConstraint: Option.Option<VersionConstraint>;
}

export type ResolvedConfiguredSkill = ResolvedConfiguredEntry<SkillExtensionRef>;
export type ResolvedConfiguredSubagent = ResolvedConfiguredEntry<SubagentExtensionRef>;
export type ResolvedConfiguredCommand = ResolvedConfiguredEntry<CommandExtensionRef>;
export type ResolvedConfiguredMcpServer = ResolvedConfiguredEntry<McpServerExtensionRef>;
export type ResolvedConfiguredPack = ResolvedConfiguredEntry<ExtensionPackRef>;

export const toConfiguredEntryFailureReason = (error: AppError): ConfiguredEntryFailureReason => {
  switch (error.code) {
    case "WORKSPACE_INSTALL_SOURCE_INVALID":
      return "entry-malformed";
    case "SKILL_SOURCE_MISSING":
    case "SUBAGENT_SOURCE_MISSING":
    case "COMMAND_SOURCE_MISSING":
    case "MCP_SERVER_SOURCE_MISSING":
    case "PACK_SOURCE_MISSING":
      return "source-not-found";
    case "CONFIGURED_ENTRY_RESOLUTION_TIMEOUT":
      return "source-timeout";
    default:
      return "source-resolution-failed";
  }
};
