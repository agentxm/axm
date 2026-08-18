import type * as Option from "effect/Option";
import type { AppError } from "../../app-error/index.js";
import type { HookExtensionRef } from "../../hooks/index.js";
import type { KnowledgeExtensionRef } from "../../knowledge/index.js";
import type { McpServerExtensionRef } from "../../mcps/index.js";
import type { PackRef } from "../../packs/index.js";
import type { RuleExtensionRef } from "../../rules/index.js";
import type { SkillExtensionRef } from "../../skills/index.js";
import type { SubagentExtensionRef } from "../../subagents/index.js";
import type { VersionRange } from "../../version-constraints/version-constraints.js";
import type { NamedRegistryResolution } from "../../sources/index.js";
import type { ReleaseAgeBypassRecord, ReleaseAgeHoldbackRecord } from "../../registry/index.js";

export type ConfiguredEntryFailureReason =
  | "entry-malformed"
  | "source-not-found"
  | "source-multiple-matches"
  | "source-resolution-failed"
  | "source-timeout";

export interface ResolvedConfiguredEntry<TRef> {
  readonly ref: TRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly releaseAge?: {
    readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
    readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
  };
}

export type ResolvedConfiguredSkill = ResolvedConfiguredEntry<SkillExtensionRef>;
export type ResolvedConfiguredSubagent = ResolvedConfiguredEntry<SubagentExtensionRef>;
export type ResolvedConfiguredRule = ResolvedConfiguredEntry<RuleExtensionRef>;
export type ResolvedConfiguredHook = ResolvedConfiguredEntry<HookExtensionRef>;
export type ResolvedConfiguredKnowledge = ResolvedConfiguredEntry<KnowledgeExtensionRef>;
export type ResolvedConfiguredMcpServer = ResolvedConfiguredEntry<McpServerExtensionRef>;
export type ResolvedConfiguredPack = ResolvedConfiguredEntry<PackRef>;

export type ConfiguredRegistryResolution = NamedRegistryResolution & {
  readonly versionRange: Option.Option<VersionRange>;
  readonly acceptedVersion?: string;
};

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
