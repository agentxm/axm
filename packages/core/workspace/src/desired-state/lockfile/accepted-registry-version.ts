import * as Option from "effect/Option";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "./schema.js";

type ExternalLockEntry =
  | SkillLockEntry
  | McpServerLockEntry
  | SubagentLockEntry
  | RuleLockEntry
  | HookLockEntry
  | KnowledgeLockEntry
  | PackLockEntry;

interface RegistryRefIdentity {
  readonly owner: string;
  readonly name: string;
  readonly publisherBindingId: string;
}

const isRegistryLockEntry = (
  entry: ExternalLockEntry,
): entry is Extract<ExternalLockEntry, { readonly source: { readonly type: "registry" } }> =>
  entry.source.type === "registry";

/** Return the accepted version only when the complete Registry identity matches. */
export const acceptedRegistryVersionForRef = (
  entry: Option.Option<ExternalLockEntry>,
  ref: RegistryRefIdentity,
): string | undefined => {
  if (Option.isNone(entry)) return undefined;
  return isRegistryLockEntry(entry.value) &&
    entry.value.identity.owner === ref.owner &&
    entry.value.identity.name === ref.name &&
    entry.value.resolved.publisherBindingId === ref.publisherBindingId
    ? entry.value.resolved.version
    : undefined;
};
