import type * as Option from "effect/Option";
import type { AppError } from "../../app-error/index.js";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { NamedRegistryResolution } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type {
  ReleaseAgeBypassRecord,
  ReleaseAgeHoldbackRecord,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";

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
