import * as Option from "effect/Option";
import type { PackLockEntry, SkillLockEntry } from "./schema.js";

type ExternalLockEntry = SkillLockEntry | PackLockEntry;

interface RegistryRefIdentity {
  readonly owner: string;
  readonly name: string;
  readonly publisherBindingId: string;
}

/** Return the accepted version only when the complete Registry identity matches. */
export const acceptedRegistryVersionForRef = (
  entry: Option.Option<ExternalLockEntry>,
  ref: RegistryRefIdentity,
): string | undefined => {
  if (Option.isNone(entry)) return undefined;
  return entry.value.type === "registry" &&
    entry.value.owner === ref.owner &&
    entry.value.name === ref.name &&
    entry.value.publisherBindingId === ref.publisherBindingId
    ? entry.value.resolvedVersion
    : undefined;
};
