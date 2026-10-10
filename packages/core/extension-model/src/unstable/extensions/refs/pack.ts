/**
 * Pack ref types.
 *
 * Concrete pack refs built on top of the shared ref base hierarchy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  GitHostedRefDetails,
  LocalRefDetails,
  PackRefBase,
  RegistryRefDetails,
  WorkspaceRefDetails,
} from "./ref-base.js";
import type {
  GitBasedSource,
  LocalSource,
  RegistrySource,
  WorkspaceSource,
} from "../../sources/types.js";
import type { HookExtensionRef } from "./hook.js";
import type { KnowledgeExtensionRef } from "./knowledge.js";
import type { McpServerExtensionRef } from "./mcp-server.js";
import type { RuleExtensionRef } from "./rule.js";
import type { SkillExtensionRef } from "./skill.js";
import type { SubagentExtensionRef } from "./subagent.js";

/** A non-Pack ref discovered from the same immutable source view. @experimental */
export type SourceInheritedPackMemberRef =
  | SkillExtensionRef
  | McpServerExtensionRef
  | SubagentExtensionRef
  | RuleExtensionRef
  | HookExtensionRef
  | KnowledgeExtensionRef;

type SourceInheritedPackMembers = {
  /** Runtime-only candidates discovered beside this Pack at the same accepted source view. */
  readonly sourceMembers: ReadonlyArray<SourceInheritedPackMemberRef>;
};

/**
 * The candidates beside a Pack that one of its dependencies names. A member is
 * matched by declared identity, so exactly one match is the member and any
 * other count leaves the dependency unresolved in this source view.
 *
 * @experimental
 */
export const sourceInheritedMembersNamed = (
  pack: SourceInheritedPackMembers,
  identity: {
    readonly type: SourceInheritedPackMemberRef["type"];
    readonly owner: string;
    readonly name: string;
  },
): ReadonlyArray<SourceInheritedPackMemberRef> =>
  pack.sourceMembers.filter(
    (candidate) =>
      candidate.type === identity.type &&
      candidate.owner === identity.owner &&
      candidate.name === identity.name,
  );

// -----------------------------------------------------------------------------
// Layer 3: Concrete Pack Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type RegistryPackRef = PackRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type GitHostedPackRef = PackRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails &
  SourceInheritedPackMembers;
/** @experimental */
export type LocalPackRef = PackRefBase<"local", LocalSource> &
  LocalRefDetails &
  SourceInheritedPackMembers;
/** @experimental */
export type WorkspacePackRef = PackRefBase<"workspace", WorkspaceSource> & WorkspaceRefDetails;

/** @experimental */
export type PackRef = RegistryPackRef | GitHostedPackRef | LocalPackRef | WorkspacePackRef;
