/**
 * The accepted resolution an install records for an acquired extension: the
 * lock entry composed from the ref's source and identity and the content
 * identity acquisition established, keyed by the extension's configured name.
 *
 * Skills, subagents, rules, hooks, and Knowledge bundles record the same
 * skeleton and raise the same failure when acquisition left nothing to
 * record. MCP servers and packs key and shape their entries differently and
 * keep their own.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { extensionTypeToPlural } from "@agentxm/extension-model/unstable/extensions/common";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  gitSourceLockFields,
  pathSourceLockFields,
  portableGitSourceLockFields,
  registrySourceLockFields,
  validateExactResolvedVersion,
  type HookLockEntry,
  type KnowledgeLockEntry,
  type LockfileResolvedVersionInvalid,
  type RuleLockEntry,
  type SkillLockEntry,
  type SubagentLockEntry,
  type TreeIntegrity,
} from "../desired-state/index.js";

/**
 * A lock entry was requested for an acquired extension whose install left no
 * content identity to record.
 */
export class InstallStateMissing extends Data.TaggedError("InstallStateMissing")<{
  readonly type: InstallableExtensionType;
  readonly name: string;
}> {}

/** The content identity a canonical acquisition established, as the lockfile records it. */
export interface AcquiredContentIdentity {
  readonly sourceHash: SourceHash;
  readonly treeIntegrity: TreeIntegrity;
  /** Workspace-root-relative local source path; `None` for non-local refs. */
  readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
}

/** The lock entry an install records under the extension's configured name. */
export interface AcceptedResolution<TEntry> {
  readonly key: string;
  readonly entry: TEntry;
}

type AcquirableRef =
  | SkillExtensionRef
  | SubagentExtensionRef
  | RuleExtensionRef
  | HookExtensionRef
  | KnowledgeExtensionRef;

type AcquiredRef = Exclude<AcquirableRef, { readonly refType: "workspace" }>;

interface AcceptedResolutionInput<TRef extends AcquirableRef> {
  readonly ref: TRef;
  /** What acquisition established; `None` when no acquisition ran or it left no identity. */
  readonly acquired: Option.Option<AcquiredContentIdentity>;
}

type AcceptedResolutionEffect<TEntry> = Effect.Effect<
  Option.Option<AcceptedResolution<TEntry>>,
  InstallStateMissing | LockfileResolvedVersionInvalid
>;

/**
 * Compose the lock entry from the ref's source and identity and the acquired
 * content identity. Only a skill may omit its owner (a portable skill), so
 * only a skill can produce an entry without one.
 */
const lockEntry = (ref: AcquiredRef, acquired: AcquiredContentIdentity): SkillLockEntry => {
  switch (ref.refType) {
    case "git-hosted":
      return ref.owner === undefined
        ? portableGitSourceLockFields(
            ref.source,
            Option.fromUndefinedOr(ref.sourcePath),
            ref.gitCommitSha,
            ref.gitTreeSha,
            ref.name,
            acquired.treeIntegrity,
          )
        : gitSourceLockFields(
            ref.source,
            Option.fromUndefinedOr(ref.sourcePath),
            ref.gitCommitSha,
            ref.gitTreeSha,
            ref.owner,
            ref.name,
            acquired.treeIntegrity,
          );
    case "local": {
      const path = Option.getOrElse(
        acquired.workspaceRelativeLocalSourcePath,
        () => ref.source.path,
      );
      return ref.owner === undefined
        ? {
            source: { type: "path", path },
            identity: { name: ref.name },
            resolved: { tree: acquired.sourceHash },
            treeIntegrity: acquired.treeIntegrity,
          }
        : pathSourceLockFields(
            path,
            acquired.sourceHash,
            ref.name,
            acquired.treeIntegrity,
            ref.owner,
          );
    }
    case "registry":
      return registrySourceLockFields(
        ref.source,
        ref.owner,
        ref.name,
        ref.version,
        Option.getOrElse(ref.integrity, () => ""),
        ref.publisherBindingId,
        acquired.treeIntegrity,
      );
  }
};

/**
 * The accepted resolution to record for `ref`: `None` for workspace-authored
 * content, which carries no lock authority; otherwise the lock entry built
 * from what acquisition established, keyed by the extension's configured
 * name. Fails with {@link InstallStateMissing} when acquisition left no
 * identity to record, and refuses a Registry version that is not exact.
 *
 * Each overload returns the entry type its lock collection records; the
 * implementation is typed by the widest of them, the skill entry, whose
 * owner is optional.
 */
export function acceptedResolutionFor(
  input: AcceptedResolutionInput<SkillExtensionRef>,
): AcceptedResolutionEffect<SkillLockEntry>;
export function acceptedResolutionFor(
  input: AcceptedResolutionInput<SubagentExtensionRef>,
): AcceptedResolutionEffect<SubagentLockEntry>;
export function acceptedResolutionFor(
  input: AcceptedResolutionInput<RuleExtensionRef>,
): AcceptedResolutionEffect<RuleLockEntry>;
export function acceptedResolutionFor(
  input: AcceptedResolutionInput<HookExtensionRef>,
): AcceptedResolutionEffect<HookLockEntry>;
export function acceptedResolutionFor(
  input: AcceptedResolutionInput<KnowledgeExtensionRef>,
): AcceptedResolutionEffect<KnowledgeLockEntry>;
export function acceptedResolutionFor(
  input: AcceptedResolutionInput<AcquirableRef>,
): AcceptedResolutionEffect<SkillLockEntry> {
  const { ref, acquired } = input;
  return Effect.gen(function* () {
    if (ref.refType === "workspace") return Option.none();
    const name = extensionRefName(ref);
    if (Option.isNone(acquired)) {
      return yield* new InstallStateMissing({ type: ref.type, name });
    }
    if (ref.refType === "registry") {
      yield* validateExactResolvedVersion(
        `${extensionTypeToPlural[ref.type]}.${name}.resolvedVersion`,
        ref.version,
      );
    }
    return Option.some({ key: name, entry: lockEntry(ref, acquired.value) });
  });
}
