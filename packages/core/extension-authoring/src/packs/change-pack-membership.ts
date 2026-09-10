/**
 * Changing which extensions an authored pack declares.
 *
 * A pack's membership is a manifest an author owns, so both directions share
 * one use case: find the pack the selector names, confirm the workspace
 * authors it, read the manifest under a plan-time hash, decide which members
 * the selector resolves to, and reduce that to a delta. An empty delta is a
 * settled outcome, not a failure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  isCatalogExtensionType,
  type CatalogExtensionType,
} from "@agentxm/extension-model/unstable/extension-types";
import {
  decodeExtensionNameSync,
  formatFqn,
  parseExtensionFqnParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ExecutionCandidate,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  computePackPathsForLayout,
  configuredRowsByName,
  resolveWorkspaceExtensionRef,
  usableAcceptedCanonical,
} from "@agentxm/workspace-state";
import type { WorkspaceTransactionScope } from "@agentxm/workspace-transactions";

import { settingsRelativePath } from "../create/authoring-owner.js";
import { addToPack } from "./add-to-pack.js";
import { resolveConfiguredPackSelector } from "./configured-pack-selector.js";
import { hashContent } from "./hash-content.js";
import { isSelectorPattern, selectorMatches } from "./glob.js";
import {
  PackGraphInvalid,
  PackManifestUnavailable,
  PackMemberAmbiguous,
  PackMemberNotDeclared,
  PackMemberNotFound,
  PackMemberUnmanaged,
  PackNotAuthored,
  PackOwnerUnconfigured,
  PackSourceMissing,
} from "./membership-errors.js";
import { removeFromPack } from "./remove-from-pack.js";

// -----------------------------------------------------------------------------
// Request and candidate
// -----------------------------------------------------------------------------

export interface PackMembershipRequest {
  /** Which direction the membership changes. */
  readonly change: "add" | "remove";
  /** Configured pack name, or an owner-qualified pack identity. */
  readonly pack: string;
  /** A member name, an owner-qualified identity, or a glob pattern. */
  readonly selector: string;
}

/** What a membership step requires when it runs. */
export type PackMembershipRequirements =
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | WorkspaceTransactionScope;

export interface PackMembershipChange {
  readonly _tag: "Change";
  readonly change: "add" | "remove";
  /** Configured name of the pack being edited. */
  readonly pack: string;
  /** Owner-qualified identities the manifest gains or loses, sorted. */
  readonly members: ReadonlyArray<string>;
  readonly execution: ExecutionCandidate<PackMembershipRequirements>;
}

export interface PackMembershipUnchanged {
  readonly _tag: "NoChange";
  readonly change: "add" | "remove";
  readonly pack: string;
}

/** A settled membership request: either a delta to resolve, or nothing to do. */
export type PackMembershipCandidate = PackMembershipChange | PackMembershipUnchanged;

// -----------------------------------------------------------------------------
// Member candidates
// -----------------------------------------------------------------------------

/**
 * Derive a lower-bound range from a resolved version.
 *
 * A lower bound tracks the latest published member while recording the
 * version observed when the member was added. A caret would pin pre-1.0
 * members to their current minor (`^0.4.2` stops before `0.5.0`), stranding
 * every later release.
 */
const toVersionRange = (version: string): string => `>=${version}`;

interface PackMemberCandidate {
  readonly type: CatalogExtensionType;
  /** Workspace projection name. */
  readonly name: string;
  readonly owner: Handle;
  /** Published package name, which may differ from the workspace name. */
  readonly packageName: ExtensionName;
  readonly fqn: string;
  readonly versionRange: string;
}

/** Every managed, versioned extension in the workspace a pack may depend on. */
const memberCandidates = Effect.fn("ChangePackMembership.memberCandidates")(function* () {
  const ws = yield* WorkspaceMutations;
  const graph = yield* ws.getDesiredStateGraph();
  const candidates: Array<PackMemberCandidate> = [];
  for (const node of graph.nodes) {
    if (!isCatalogExtensionType(node.type)) continue;
    if (node.source === undefined) continue;
    const ref = node.identity.startsWith("workspace:")
      ? yield* resolveWorkspaceExtensionRef({
          settingsName: node.name,
          source: node.source,
          expectedType: node.type,
          layout: ws.layout,
          scope: ws.scope,
        }).pipe(Effect.map(Option.some))
      : yield* usableAcceptedCanonical({ workspace: ws, type: node.type, name: node.name }).pipe(
          Effect.map(Option.map((canonical) => canonical.ref)),
        );
    if (
      Option.isNone(ref) ||
      (ref.value.refType !== "registry" && ref.value.refType !== "workspace")
    ) {
      continue;
    }
    const acceptedIdentity = node.identity.startsWith("workspace:")
      ? node.identity.slice("workspace:".length)
      : node.identity;
    const parsed = parseExtensionFqnParts(acceptedIdentity);
    if (parsed === undefined || parsed.type !== node.type) continue;
    const packageName = decodeExtensionNameSync(parsed.name);
    candidates.push({
      type: node.type,
      name: node.name,
      owner: parsed.owner,
      packageName,
      fqn: formatFqn({ owner: parsed.owner, type: node.type, name: packageName }),
      versionRange: toVersionRange(ref.value.version),
    });
  }
  return { graph, candidates };
});

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle a membership change without writing anything. */
export const preparePackMembership = Effect.fn("ChangePackMembership.prepare")(function* (
  request: PackMembershipRequest,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const configuredPacks = yield* ws.records
    .rows("pack")
    .pipe(Effect.map((rows) => Object.values(configuredRowsByName(rows))));
  const configuredOwner = yield* ws.getConfiguredOwner();
  const selection = yield* resolveConfiguredPackSelector({
    configured: configuredPacks,
    ...(Option.isNone(configuredOwner) ? {} : { configuredOwner: configuredOwner.value }),
    selector: request.pack,
  });
  const pack = selection.configuredName;

  const source = selection.entry.source;
  if (source === undefined) return yield* new PackSourceMissing({ pack });
  if (!isWorkspaceSourceLocator(source)) return yield* new PackNotAuthored({ pack });
  if (Option.isNone(configuredOwner)) {
    return yield* new PackOwnerUnconfigured({ pack, settingsPath: settingsRelativePath(path, ws) });
  }
  const packOwner = configuredOwner.value;

  const manifestPath = path.join(
    computePackPathsForLayout(path.join, ws.layout, "workspace", packOwner, pack).canonicalPath,
    PACK_MANIFEST_FILENAME,
  );
  const manifestContent = yield* fs
    .readFileString(manifestPath)
    .pipe(
      Effect.mapError(
        (cause) => new PackManifestUnavailable({ path: manifestPath, reason: "unreadable", cause }),
      ),
    );
  const manifestHash = hashContent(manifestContent);
  const json = yield* Effect.try({
    try: (): unknown => JSON.parse(manifestContent),
    catch: (cause) =>
      new PackManifestUnavailable({ path: manifestPath, reason: "unparsable", cause }),
  });
  const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
    Effect.mapError(
      (cause) => new PackManifestUnavailable({ path: manifestPath, reason: "invalid", cause }),
    ),
  );

  const pattern = isSelectorPattern(request.selector);
  const members = yield* request.change === "add"
    ? additions({ pack, packOwner, request, pattern, manifest })
    : removals({ manifest, request, pattern });

  if (members.length === 0) {
    return { _tag: "NoChange", change: request.change, pack } satisfies PackMembershipUnchanged;
  }

  const step: PlannedJobStep<PackMembershipRequirements> = {
    readiness: "ready",
    label: pack,
    run:
      request.change === "add"
        ? addToPack({
            name: "add-to-pack",
            args: {
              packName: pack,
              packOwner,
              additions: Object.fromEntries(members.map((member) => [member.fqn, member.range])),
              manifestHash,
            },
          })
        : removeFromPack({
            name: "remove-from-pack",
            args: {
              packName: pack,
              packOwner,
              removals: members.map((member) => member.fqn),
              manifestHash,
            },
          }),
  };

  const memberCount = members.length;
  const plan: Plan<PackMembershipRequirements> = {
    _tag: "Plan",
    name: packMembershipPlanName(request.change),
    description: Option.some(
      request.change === "add"
        ? `Add ${memberCount} ${memberCount === 1 ? "extension" : "extensions"} to ${pack}`
        : `Remove ${memberCount} ${memberCount === 1 ? "extension" : "extensions"} from ${pack}`,
    ),
    presentation: operationPresentation(
      request.change === "add"
        ? { imperative: "add", past: "Added", gerund: "Adding" }
        : { imperative: "remove", past: "Removed", gerund: "Removing" },
      "pack",
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };

  return {
    _tag: "Change",
    change: request.change,
    pack,
    members: members.map((member) => member.fqn),
    execution: yield* prepareExecutionCandidate(plan),
  } satisfies PackMembershipChange;
});

interface ResolvedMember {
  readonly fqn: string;
  readonly range: string;
}

const additions = Effect.fn("ChangePackMembership.additions")(function* (args: {
  readonly pack: string;
  readonly packOwner: Handle;
  readonly request: PackMembershipRequest;
  readonly pattern: boolean;
  readonly manifest: { readonly dependencies: Readonly<Record<string, string>> };
}) {
  const { candidates, graph } = yield* memberCandidates();
  const packFqn = formatFqn({
    owner: args.packOwner,
    type: "pack",
    name: decodeExtensionNameSync(args.pack),
  });
  const targetPackProblems = graph.problems.filter(
    (problem) =>
      "pack" in problem && (problem.pack === packFqn || problem.pack === `workspace:${packFqn}`),
  );
  if (targetPackProblems.length > 0) return yield* new PackGraphInvalid({ packFqn });

  const requestedFqn = parseExtensionFqnParts(args.request.selector);
  const matched = args.pattern
    ? candidates.filter((candidate) => selectorMatches(args.request.selector, candidate.name))
    : requestedFqn !== undefined
      ? candidates.filter(
          (candidate) =>
            candidate.type === requestedFqn.type &&
            candidate.owner === requestedFqn.owner &&
            candidate.packageName === requestedFqn.name,
        )
      : candidates.filter((candidate) => candidate.name === args.request.selector);

  // A bare name installed under more than one type is ambiguous: adding the
  // wrong one would silently pin an extension the author did not mean.
  if (!args.pattern && requestedFqn === undefined) {
    const matchedTypes = [...new Set(matched.map((candidate) => candidate.type))];
    if (matchedTypes.length > 1) {
      return yield* new PackMemberAmbiguous({
        selector: args.request.selector,
        pack: args.pack,
        matches: matched.map((candidate) => ({ type: candidate.type, fqn: candidate.fqn })),
      });
    }
  }

  if (matched.length === 0) {
    if (args.pattern) {
      return yield* new PackMemberNotFound({ selector: args.request.selector, pattern: true });
    }
    const installed = graph.nodes.some(
      (node) => node.type !== "pack" && node.name === args.request.selector,
    );
    return yield* installed
      ? new PackMemberUnmanaged({ selector: args.request.selector })
      : new PackMemberNotFound({ selector: args.request.selector, pattern: false });
  }

  const resolved: Array<ResolvedMember> = [];
  for (const candidate of matched) {
    if (args.manifest.dependencies[candidate.fqn] === candidate.versionRange) continue;
    resolved.push({ fqn: candidate.fqn, range: candidate.versionRange });
  }
  return resolved;
});

const removals = Effect.fn("ChangePackMembership.removals")(function* (args: {
  readonly manifest: { readonly dependencies: Readonly<Record<string, string>> };
  readonly request: PackMembershipRequest;
  readonly pattern: boolean;
}) {
  const declared = Object.keys(args.manifest.dependencies);
  const matched = args.pattern
    ? declared.filter((fqn) => selectorMatches(args.request.selector, fqn))
    : declared.includes(args.request.selector)
      ? [args.request.selector]
      : [];
  if (matched.length === 0) {
    return yield* new PackMemberNotDeclared({
      selector: args.request.selector,
      pattern: args.pattern,
    });
  }
  return matched.map((fqn) => ({ fqn, range: "" }) satisfies ResolvedMember);
});

/** The plan a membership change of this direction resolves. */
export const packMembershipPlanName = (change: "add" | "remove"): string =>
  change === "add" ? "Add to pack" : "Remove from pack";

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled membership change. */
export const previewOrApplyPackMembership = (
  candidate: PackMembershipChange,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);

/** The pack-membership use case: settle a request, then preview or apply it. */
export const ChangePackMembership = {
  prepare: preparePackMembership,
  previewOrApply: previewOrApplyPackMembership,
} as const;
