import type * as Option from "effect/Option";
import type { CommandExtensionRef } from "../../commands/index.js";
import type { AppError } from "../../app-error/index.js";
import type { McpServerExtensionRef } from "../../mcp-servers/index.js";
import type { ExtensionPackRef } from "../../packs/index.js";
import type { SkillExtensionRef } from "../../skills/index.js";
import type { SubagentExtensionRef } from "../../subagents/index.js";
import type { VersionRange } from "../../version-constraints/version-constraints.js";

export type ConfiguredEntryFailureReason =
  | "entry-malformed"
  | "source-not-found"
  | "source-multiple-matches"
  | "source-resolution-failed"
  | "source-timeout";

export interface ResolvedConfiguredEntry<TRef> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<VersionRange>;
}

export type ResolvedConfiguredSkill = ResolvedConfiguredEntry<SkillExtensionRef>;
export type ResolvedConfiguredSubagent = ResolvedConfiguredEntry<SubagentExtensionRef>;
export type ResolvedConfiguredCommand = ResolvedConfiguredEntry<CommandExtensionRef>;
export type ResolvedConfiguredMcpServer = ResolvedConfiguredEntry<McpServerExtensionRef>;
export type ResolvedConfiguredPack = ResolvedConfiguredEntry<ExtensionPackRef>;

export const toConfiguredEntryFailureReason = (error: AppError): ConfiguredEntryFailureReason => {
  switch (error.code) {
    case "validation":
      return "entry-malformed";
    case "not_found":
      return "source-not-found";
    default:
      if (error.message.includes("Timed out")) {
        return "source-timeout";
      }
      return "source-resolution-failed";
  }
};
