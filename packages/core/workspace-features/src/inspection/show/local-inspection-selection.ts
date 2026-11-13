import * as Data from "effect/Data";
import * as Option from "effect/Option";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionType,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import { type InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  desiredIdentityFqn,
  lockEntryToSourceParams,
  type DesiredExtensionNode,
  type DesiredNodeIdentity,
  type ExtensionInventoryRow,
  type LockEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import type { InspectionIdentity } from "./local-inspection-document.js";

export type InspectionSelection =
  | { readonly kind: "identities"; readonly identities: ReadonlyArray<string> }
  | { readonly kind: "paths"; readonly paths: ReadonlyArray<string> }
  | { readonly kind: "all" };
export interface LocalInspectionRequest {
  readonly selection: InspectionSelection;
  readonly types?: ReadonlyArray<InstallableExtensionType>;
  readonly agents?: ReadonlyArray<string>;
}
export class InvalidInspectionSelection extends Data.TaggedError("InvalidInspectionSelection")<{
  readonly detail: string;
}> {}

/** Exact local selectors deliberately exclude release requests and pattern matching. */
export const inspectionSelectionIssue = (selection: InspectionSelection): string | undefined => {
  if (selection.kind === "all") return undefined;
  const inputs = selection.kind === "paths" ? selection.paths : selection.identities;
  if (inputs.length === 0) return "Select an identity, --path, or --all";
  if (inputs.some((input) => input.trim() === "")) return "An inspection selector cannot be empty";
  if (selection.kind === "paths") return undefined;
  for (const input of inputs) {
    if (/[*?[\]{}]/u.test(input))
      return `Inspection requires an exact identity, not a glob: ${input}`;
    const fqn = input.includes(":@") ? input.slice(input.indexOf(":@") + 1) : input;
    if (fqn.startsWith("@")) {
      const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
      if (parsed === undefined || parsed.name === undefined || fqn.slice(1).includes("@"))
        return `Inspection requires an exact local identity without a version or range: ${input}`;
    } else if (input.includes("@") || input.includes(":") || input.includes("/"))
      return `Invalid local identity: ${input}`;
  }
  return undefined;
};

export interface InspectionCandidate {
  readonly id: string;
  readonly identity: InspectionIdentity;
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly row?: ExtensionInventoryRow;
  readonly node?: DesiredExtensionNode;
  readonly accepted?: LockEntry;
  readonly canonicalPath?: string;
  readonly inInventory: boolean;
  readonly competingClaim?: boolean;
}

export const inspectionSource = (
  identity: DesiredNodeIdentity,
  locator?: string,
): InspectionIdentity["source"] => ({
  authority: identity.authority,
  ...(locator === undefined ? {} : { locator }),
  ...(identity.authority === "registry" && identity.registry.sourceName !== undefined
    ? { sourceName: identity.registry.sourceName }
    : {}),
  ...(identity.authority === "registry" && identity.registry.endpoint !== undefined
    ? { endpoint: identity.registry.endpoint.href }
    : {}),
});
export const acceptedInspectionSource = (accepted: LockEntry): InspectionIdentity["source"] => ({
  authority: accepted.source.type,
  locator: printSourceParams(lockEntryToSourceParams(accepted)),
  ...(accepted.source.type === "registry" ? { endpoint: accepted.source.url.href } : {}),
});
export const inspectionIdentity = (args: {
  readonly scope: "project" | "user";
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly node?: DesiredExtensionNode;
  readonly accepted?: LockEntry;
  readonly row?: ExtensionInventoryRow;
}): InspectionIdentity => {
  const fqn =
    args.node !== undefined
      ? Option.getOrUndefined(desiredIdentityFqn(args.node.identity))
      : args.accepted?.identity.owner !== undefined
        ? `${args.accepted.identity.owner}/${toExtensionTypePlural(args.type)}/${args.accepted.identity.name}`
        : undefined;
  return {
    type: args.type,
    name: args.name,
    scope: args.scope,
    ...(fqn === undefined ? {} : { fqn }),
    source:
      args.node !== undefined
        ? inspectionSource(args.node.identity, args.node.source)
        : args.accepted !== undefined
          ? acceptedInspectionSource(args.accepted)
          : {
              authority:
                args.row?.classification.lifecycle === "undeclared"
                  ? "workspace"
                  : args.row?.classification.lifecycle === "unmanaged"
                    ? "unmanaged"
                    : "unknown",
            },
  };
};
export const matchesInspectionIdentity = (
  input: string,
  candidate: InspectionCandidate,
  selectedEndpoint?: string,
): boolean => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
  if (parsed === undefined) return candidate.name === input;
  if (
    parsed.name === undefined ||
    parsed.type === undefined ||
    toExtensionType(parsed.type) !== candidate.type
  )
    return false;
  if (candidate.identity.fqn !== `${parsed.owner}/${parsed.type}/${parsed.name}`) return false;
  return (
    Option.isNone(parsed.sourceName) ||
    (selectedEndpoint === undefined
      ? candidate.identity.source.sourceName === parsed.sourceName.value
      : candidate.identity.source.endpoint === selectedEndpoint)
  );
};
