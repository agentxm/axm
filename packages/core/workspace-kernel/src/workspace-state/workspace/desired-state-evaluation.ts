import {
  sameRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { McpDistribution, McpBinding, McpAuth } from "../../agent-adapters/index.js";
/**
 * Pure desired-state evaluation over one captured input view.
 *
 * Nothing here reads the filesystem, the clock, or a service: the settings,
 * the Registry bindings, the accepted resolutions, and every Pack document
 * arrive already observed, so two evaluations of equivalent inputs settle the
 * same nodes, closures, problems, and membership knowledge whatever order
 * the inputs were declared in.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  extensionTypes,
  packMemberRegistrySource,
  packMemberVersionRange,
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  LOCKFILE_NAME,
  SETTINGS_FILENAME,
} from "@agentxm/extension-model/unstable/workspace-files";
import {
  normalizeVersionRequest,
  versionSatisfiesRequest,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  configuredPackIdentity,
  configuredPackRegistrySource,
  desiredNodeKey,
  inheritedMemberSourceAuthority,
  registryIdentity,
  sourceIdentity,
} from "./desired-configured-identity.js";
import type { DesiredEvaluationInputs } from "./desired-evaluation-inputs.js";
import {
  formatDesiredIdentity,
  sameDesiredPackage,
  sameSourceIdentity,
  type DesiredNodeIdentity,
  type DesiredPackIdentity,
  type DesiredSourceAuthority,
  desiredMcpSourceKey,
} from "./desired-identity.js";
import { authorizeExternalPackRoutes } from "./desired-pack-lock.js";
import { effectiveExtensionActivation, isDesiredExtensionActive } from "./desired-state-enabled.js";
import {
  effectiveDesiredConstraint,
  isSourcedDesiredExtension,
  settleDesiredNodeConstraint,
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredExtensionNode,
  type DesiredExtensionOrigin,
  type DesiredMemberPreference,
  type DesiredMemberSubject,
  type DesiredMembershipUnknownReason,
  type DesiredMcpSourceClosure,
  type DesiredPackMembership,
  type DesiredPackRoutes,
  type DesiredStateGraph,
  type DesiredStateProblem,
  type SettledExtensionNode,
} from "./desired-state-graph.js";
import { desiredProblemSubject } from "./desired-state-queries.js";
import { lockEntryMatchesSourceLocator } from "./lock-entry.js";
import { lockEntries } from "./entry-accessors.js";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import { McpSourceIdentity, McpSourceKey } from "./mcp-source-identity.js";

interface CandidateCommon {
  readonly type: ExtensionType;
  readonly name: string;
  readonly identity: DesiredNodeIdentity;
  readonly enabled: boolean;
  readonly constraint?: string;
  readonly origin: DesiredExtensionOrigin;
}

type Candidate = CandidateCommon &
  (
    | { readonly authority: "sourced"; readonly source: string }
    | {
        readonly type: "mcp-server";
        readonly authority: "inline";
        readonly source?: undefined;
      }
  );

/** The one settled order of problems: Pack problems first, then extension problems, by subject then kind. */
const problemOrder = (problem: DesiredStateProblem): string => {
  const subject = desiredProblemSubject(problem);
  return subject.kind === "pack"
    ? `0:${subject.pack}:${problem.type}`
    : `1:${subject.type}:${subject.name}:${problem.type}`;
};

/**
 * Where a candidate acquires its package: a Pack route's own source view
 * decides for its member, and otherwise the authority its identity is held
 * under. A Registry identity with no bound endpoint names no known Registry.
 */
type CandidateAcquisition =
  | { readonly kind: "workspace" }
  | { readonly kind: "registry"; readonly endpoint: RegistryEndpoint }
  | { readonly kind: "unbound-registry" }
  | { readonly kind: "other" };

const candidateAcquisition = (candidate: Candidate): CandidateAcquisition => {
  const routed = candidate.origin.type === "pack" ? candidate.origin.sourceAuthority : undefined;
  if (routed !== undefined) {
    return routed.authority === "workspace"
      ? { kind: "workspace" }
      : routed.authority === "registry"
        ? { kind: "registry", endpoint: routed.endpoint }
        : { kind: "other" };
  }
  const identity = candidate.identity;
  if (identity.authority === "workspace") return { kind: "workspace" };
  if (identity.authority !== "registry") return { kind: "other" };
  return identity.registry.endpoint === undefined
    ? { kind: "unbound-registry" }
    : { kind: "registry", endpoint: identity.registry.endpoint };
};

/**
 * Whether two candidates name one package the graph can merge into one node.
 * Merge candidacy is by package name; the same FQN acquired from two
 * different Registries is two packages, never one, and is a collision. An
 * unbound Registry identity shares a package only with workspace-authored
 * content, because which Registry it names is not known.
 */
const sharesPackage = (left: Candidate, right: Candidate): boolean => {
  if (left.authority === "inline" || right.authority === "inline") return false;
  if (!sameDesiredPackage(left.identity, right.identity)) return false;
  const leftAcquisition = candidateAcquisition(left);
  const rightAcquisition = candidateAcquisition(right);
  if (leftAcquisition.kind === "workspace" || rightAcquisition.kind === "workspace") return true;
  if (leftAcquisition.kind === "unbound-registry" || rightAcquisition.kind === "unbound-registry")
    return false;
  return leftAcquisition.kind === "registry" && rightAcquisition.kind === "registry"
    ? sameRegistryEndpoint(leftAcquisition.endpoint, rightAcquisition.endpoint)
    : true;
};

/** Settings candidates first, then Pack routes by Pack name: an order the declaration order cannot move. */
const settledCandidateOrder = (left: Candidate, right: Candidate): number => {
  if (left.origin.type !== right.origin.type) return left.origin.type === "settings" ? -1 : 1;
  if (left.origin.type === "pack" && right.origin.type === "pack") {
    return left.origin.pack.fqn.localeCompare(right.origin.pack.fqn);
  }
  return 0;
};

/** A stable order for identities whose display text alone may tie. */
const identityOrder = (identity: DesiredNodeIdentity): string =>
  `${formatDesiredIdentity(identity)}\u0000${
    identity.authority === "registry" ? (identity.registry.endpoint?.href ?? "") : ""
  }`;

/**
 * Whether two identities are the same unbound Registry declaration: one FQN
 * under one configured source name that binds no endpoint. They name no
 * known source, so they are not one source, but they are one contender.
 */
const sameUnboundRegistry = (left: DesiredNodeIdentity, right: DesiredNodeIdentity): boolean =>
  left.authority === "registry" &&
  right.authority === "registry" &&
  left.registry.endpoint === undefined &&
  right.registry.endpoint === undefined &&
  left.registry.sourceName === right.registry.sourceName &&
  left.fqn === right.fqn;

/** Every structurally distinct contender, in a declaration-independent order. */
const distinctIdentities = (
  candidates: ReadonlyArray<Candidate>,
): ReadonlyArray<DesiredNodeIdentity> => {
  const distinct: DesiredNodeIdentity[] = [];
  for (const candidate of candidates) {
    if (
      !distinct.some(
        (identity) =>
          sameSourceIdentity(identity, candidate.identity) ||
          sameUnboundRegistry(identity, candidate.identity),
      )
    ) {
      distinct.push(candidate.identity);
    }
  }
  return distinct.sort((left, right) => identityOrder(left).localeCompare(identityOrder(right)));
};

const unknownMembership = (
  reason: DesiredMembershipUnknownReason,
): DesiredPackMembership["declared"] => ({ status: "unknown", reason });

/** Evaluate desired state from one captured input view. */
export const evaluateDesiredState = (inputs: DesiredEvaluationInputs): DesiredStateGraph => {
  const { settings, defaultRegistry, registryEndpoints } = inputs;
  const acceptedPacks = inputs.acceptedResolutions.packs ?? {};
  const documents = new Map(
    inputs.packDocuments.map((document) => [document.settingsName, document] as const),
  );
  const candidates: Candidate[] = [];
  const problems: DesiredStateProblem[] = [];
  /** Source-less settings entries, awaiting a Pack-supplied provider. */
  const preferences = new Map<string, DesiredMemberPreference>();
  const packMembership: DesiredPackMembership[] = [];

  const addMemberPreference = (
    type: Exclude<ExtensionType, "pack">,
    name: string,
    entry: {
      readonly enabled?: boolean | undefined;
      readonly instructionEntry?: boolean | undefined;
      readonly distribution?: McpDistribution | undefined;
      readonly bindings?: ReadonlyArray<McpBinding> | undefined;
      readonly auth?: McpAuth | undefined;
    },
  ) => {
    preferences.set(desiredNodeKey(type, name), {
      localName: name,
      location: SETTINGS_FILENAME,
      ...(entry.enabled === undefined ? {} : { enabled: entry.enabled }),
      ...(entry.instructionEntry === undefined ? {} : { instructionEntry: entry.instructionEntry }),
      ...(entry.distribution === undefined ? {} : { distribution: entry.distribution }),
      ...(entry.bindings === undefined ? {} : { bindings: entry.bindings }),
      ...(entry.auth === undefined ? {} : { auth: entry.auth }),
    });
  };

  const addSettingsEntries = (
    type: Exclude<ExtensionType, "pack">,
    entries:
      | Readonly<
          Record<
            string,
            {
              readonly kind?: "sourced" | "inline" | "configuration" | undefined;
              readonly source?: string | undefined;
              readonly enabled?: boolean | undefined;
              readonly instructionEntry?: boolean | undefined;
              readonly origin?: "bundled" | undefined;
            }
          >
        >
      | undefined,
  ) => {
    for (const [name, entry] of Object.entries(entries ?? {})) {
      if (entry.kind === "configuration" || entry.source === undefined) {
        addMemberPreference(type, name, entry);
        continue;
      }
      const bundled = type === "skill" && entry.origin === "bundled";
      const identity: { readonly identity: DesiredNodeIdentity; readonly constraint?: string } =
        bundled
          ? { identity: { authority: "bundled", fqn: `@agentxm/skills/${name}` } }
          : sourceIdentity(type, name, entry.source, settings, defaultRegistry, registryEndpoints);
      if (!bundled && isWorkspaceSourceLocator(entry.source) && settings.owner === undefined) {
        problems.push({ type: "workspace-owner-missing", extensionType: type, name });
      }
      candidates.push({
        type,
        name,
        identity: identity.identity,
        authority: "sourced",
        source: entry.source,
        enabled: entry.enabled !== false,
        ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        origin: {
          type: "settings",
          localName: name,
          authority: "sourced",
          source: entry.source,
          enabled: entry.enabled !== false,
          ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
        },
      });
    }
  };

  addSettingsEntries("skill", settings.skills);
  for (const [name, entry] of Object.entries(settings.mcpServers ?? {})) {
    if (entry.kind === "configuration") {
      addMemberPreference("mcp-server", name, entry);
      continue;
    }
    if (entry.kind === "inline") {
      candidates.push({
        type: "mcp-server",
        name,
        identity: { authority: "inline", name },
        authority: "inline",
        enabled: entry.enabled,
        origin: {
          type: "settings",
          localName: name,
          authority: "inline",
          enabled: entry.enabled,
        },
      });
      continue;
    }
    if (entry.source === undefined) {
      addMemberPreference("mcp-server", name, entry);
      continue;
    }
    const identity = sourceIdentity(
      "mcp-server",
      name,
      entry.source,
      settings,
      defaultRegistry,
      registryEndpoints,
    );
    if (isWorkspaceSourceLocator(entry.source) && settings.owner === undefined) {
      problems.push({ type: "workspace-owner-missing", extensionType: "mcp-server", name });
    }
    candidates.push({
      type: "mcp-server",
      name,
      identity: identity.identity,
      authority: "sourced",
      source: entry.source,
      enabled: entry.enabled,
      ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
      origin: {
        type: "settings",
        localName: name,
        authority: "sourced",
        source: entry.source,
        enabled: entry.enabled,
        ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
      },
    });
  }
  addSettingsEntries("subagent", settings.subagents);
  addSettingsEntries("rule", settings.rules);
  addSettingsEntries("hook", settings.hooks);
  addSettingsEntries("knowledge", settings.knowledge);

  for (const [settingsName, entry] of Object.entries(settings.packs ?? {})) {
    const acceptedPack = acceptedPacks[settingsName];
    const document = documents.get(settingsName);
    const prospective =
      document?.provenance.kind === "proposed" ? document.provenance.ref : undefined;
    const packEnabled = entry.enabled !== false;
    const identity = configuredPackIdentity(
      settingsName,
      entry.source,
      settings,
      defaultRegistry,
      registryEndpoints,
      acceptedPack,
      prospective,
    );
    if (identity === undefined) {
      problems.push({
        type: "pack-identity-mismatch",
        pack: entry.source,
        path: "",
        detail: "The configured pack source does not identify a Registry or workspace pack.",
      });
      packMembership.push({
        settingsName,
        pack: entry.source,
        enabled: packEnabled,
        declared: unknownMembership("unidentified"),
        routes: "unknown",
      });
      continue;
    }

    const packSettingsOrigin: DesiredExtensionOrigin = {
      type: "settings",
      localName: identity.name,
      authority: "sourced",
      source: entry.source,
      enabled: packEnabled,
      ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
    };
    candidates.push({
      type: "pack",
      name: identity.name,
      identity: identity.identity,
      authority: "sourced",
      source: entry.source,
      enabled: packEnabled,
      ...(identity.constraint === undefined ? {} : { constraint: identity.constraint }),
      origin: packSettingsOrigin,
    });

    const dormantRoutes: DesiredPackRoutes = packEnabled ? "unknown" : "dormant";
    const withheld = (reason: DesiredMembershipUnknownReason) => {
      packMembership.push({
        settingsName,
        pack: identity.fqn,
        enabled: packEnabled,
        declared: unknownMembership(reason),
        routes: dormantRoutes,
      });
    };
    const routes: DesiredPackRoutes = packEnabled ? "active" : "dormant";
    if (identity.identity.authority !== "workspace" && document?.provenance.kind !== "proposed") {
      const packNode: DesiredExtensionNode = {
        type: "pack",
        name: identity.name,
        identity: identity.identity,
        authority: "sourced",
        source: entry.source,
        enabled: packEnabled,
        origins: [packSettingsOrigin],
        constraint: settleDesiredNodeConstraint({
          type: "pack",
          name: identity.name,
          origins: [packSettingsOrigin],
        }),
      };
      const authorization = authorizeExternalPackRoutes({
        node: packNode,
        accepted: acceptedPack,
        declarationLocation: document?.relativePath ?? `${LOCKFILE_NAME}#packs.${settingsName}`,
      });
      if (!authorization.authorized) {
        if (packEnabled) problems.push(authorization.problem);
        packMembership.push({
          settingsName,
          pack: identity.fqn,
          enabled: packEnabled,
          declared: unknownMembership("resolution-unavailable"),
          routes: packEnabled ? "unauthorized" : "dormant",
        });
        continue;
      }
    }
    const manifestPath = document?.path ?? "";
    const observed = document?.observation ?? { status: "absent" as const };
    // A disabled Pack routes nothing, so a document it cannot supply is not
    // a problem; its membership is still recorded as unknown.
    switch (observed.status) {
      case "absent":
      case "unreadable": {
        if (packEnabled) {
          problems.push({
            type: "pack-manifest-unavailable",
            pack: identity.fqn,
            path: manifestPath,
            reason: observed.status,
            ...(observed.status === "unreadable" ? { cause: observed.reason } : {}),
          });
        }
        withheld(observed.status);
        continue;
      }
      case "malformed":
      case "schema-invalid": {
        if (packEnabled) {
          problems.push({
            type: "pack-manifest-invalid",
            pack: identity.fqn,
            path: manifestPath,
            ...(observed.status === "malformed"
              ? { reason: "malformed" as const }
              : { reason: "schema-invalid" as const, issues: observed.issues }),
          });
        }
        withheld(observed.status);
        continue;
      }
      case "decoded":
        break;
    }
    const { manifest } = observed;
    // A Registry Pack's version is judged against its request, an absent one
    // standing for `*`; other authorities are judged only when constrained.
    const request =
      identity.identity.authority === "registry"
        ? normalizeVersionRequest(Option.fromUndefinedOr(identity.constraint))
        : identity.constraint;
    if (
      manifest.owner !== identity.owner ||
      manifest.name !== identity.name ||
      (request !== undefined && !versionSatisfiesRequest(manifest.version, request))
    ) {
      if (packEnabled) {
        problems.push({
          type: "pack-identity-mismatch",
          pack: identity.fqn,
          path: manifestPath,
          detail: `Expected ${identity.fqn}${identity.constraint === undefined ? "" : `@${identity.constraint}`}, found ${manifest.owner}/packs/${manifest.name}@${manifest.version}.`,
        });
      }
      withheld("identity-mismatch");
      continue;
    }

    const members: DesiredMemberSubject[] = [];
    for (const fqn of Object.keys(manifest.dependencies)) {
      const parsed = parseExtensionFqnParts(fqn);
      if (parsed === undefined || parsed.type === "pack") continue;
      members.push({ type: parsed.type, name: parsed.name });
    }

    packMembership.push({
      settingsName,
      pack: identity.fqn,
      enabled: packEnabled,
      declared: { status: "known", members },
      routes,
    });
    if (routes !== "active") continue;

    // Members declared without a source bind to the Pack's configured
    // Registry, or to the effective default when the Pack is held elsewhere.
    const configuredRegistrySource = configuredPackRegistrySource(identity, defaultRegistry);
    const configuredRegistryEndpoint = registryEndpoints[configuredRegistrySource];
    const inheritedMemberAuthority = inheritedMemberSourceAuthority(
      entry.source,
      acceptedPack,
      identity.fqn,
      configuredRegistryEndpoint,
    );
    const packOrigin: DesiredPackIdentity = {
      authority:
        identity.identity.authority === "inline" || identity.identity.authority === "bundled"
          ? "registry"
          : identity.identity.authority,
      fqn: identity.fqn,
    };
    const relativePath = document?.relativePath ?? manifestPath;
    for (const [fqn, declaration] of Object.entries(manifest.dependencies)) {
      const parsed = parseExtensionFqnParts(fqn);
      if (parsed === undefined || parsed.type === "pack") continue;
      const constraint = packMemberVersionRange(declaration);
      const declaredSource = packMemberRegistrySource(declaration);
      // A member declared with its own Registry endpoint is bound to that
      // endpoint; one declared by name alone is bound to the Pack's Registry.
      const dependencyIdentity = registryIdentity(
        fqn,
        declaredSource === undefined
          ? { sourceName: configuredRegistrySource, endpoint: configuredRegistryEndpoint }
          : { sourceName: undefined, endpoint: declaredSource.url },
      );
      const memberAuthority: DesiredSourceAuthority | undefined =
        declaredSource === undefined
          ? inheritedMemberAuthority
          : { authority: "registry", endpoint: declaredSource.url };
      candidates.push({
        type: parsed.type,
        name: parsed.name,
        identity: dependencyIdentity,
        authority: "sourced",
        source:
          declaredSource === undefined
            ? `${fqn}@${constraint}`
            : `${declaredSource.url.href}#${fqn}@${constraint}`,
        enabled: true,
        constraint,
        origin: {
          type: "pack",
          pack: packOrigin,
          manifestPath:
            document?.provenance.kind === "accepted-lock"
              ? `${relativePath}.dependencies[${JSON.stringify(fqn)}]`
              : relativePath,
          source: declaredSource?.url.href ?? fqn,
          ...(memberAuthority === undefined ? {} : { sourceAuthority: memberAuthority }),
          constraint,
          enabled: true,
        },
      });
    }
  }

  const groups = new Map<string, Candidate[]>();
  for (const unresolved of candidates) {
    let candidate = unresolved;
    if (
      unresolved.type !== "mcp-server" &&
      unresolved.authority === "sourced" &&
      (unresolved.identity.authority === "path" ||
        unresolved.identity.authority === "git" ||
        unresolved.identity.authority === "http")
    ) {
      const accepted = lockEntries[unresolved.type].entries(inputs.acceptedResolutions)[
        unresolved.name
      ];
      if (
        accepted !== undefined &&
        accepted.identity.owner !== undefined &&
        accepted.source.type === unresolved.identity.authority &&
        lockEntryMatchesSourceLocator(accepted, unresolved.source)
      ) {
        candidate = {
          ...unresolved,
          identity: {
            ...unresolved.identity,
            fqn: `${accepted.identity.owner}/${toExtensionTypePlural(unresolved.type)}/${accepted.identity.name}`,
          },
        };
      }
    }
    if (
      unresolved.type === "mcp-server" &&
      unresolved.authority === "sourced" &&
      (unresolved.identity.authority === "path" || unresolved.identity.authority === "git")
    ) {
      const identity = unresolved.identity;
      const matches = Object.entries(inputs.acceptedResolutions.mcpServers ?? {}).filter(
        ([key, entry]) =>
          entry.source.type === identity.authority &&
          key === McpSourceKey.fromLockEntry(entry) &&
          lockEntryMatchesSourceLocator(entry, unresolved.source) &&
          (identity.fqn === undefined ||
            identity.fqn === `${entry.identity.owner}/mcps/${entry.identity.name}`),
      );
      const [accepted] = matches;
      if (matches.length === 1 && accepted !== undefined) {
        const [, entry] = accepted;
        candidate = {
          ...unresolved,
          identity: {
            ...identity,
            acceptedSource: McpSourceIdentity.fromLockEntry(entry),
            ...(entry.identity.owner === undefined
              ? {}
              : { fqn: `${entry.identity.owner}/mcps/${entry.identity.name}` }),
          },
        };
      }
    }
    const key = desiredNodeKey(candidate.type, candidate.name);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [candidate]);
    else group.push(candidate);
  }

  const nodes = new Map<string, SettledExtensionNode>();
  for (const [key, group] of groups) {
    const ordered = [...group].sort(settledCandidateOrder);
    const representative = ordered[0];
    if (representative === undefined) continue;
    // Every contender stays in evidence: the collision names them all, and
    // the graph represents the direct declaration or the first Pack route.
    const contenders = ordered.filter(
      (candidate) => candidate !== representative && !sharesPackage(representative, candidate),
    );
    if (contenders.length > 0) {
      problems.push({
        type: "projection-collision",
        extensionType: representative.type,
        name: representative.name,
        identities: distinctIdentities([representative, ...contenders]),
      });
    }
    if (representative.authority === "inline") {
      nodes.set(key, {
        type: "mcp-server",
        name: representative.name,
        identity: representative.identity,
        authority: "inline",
        enabled: representative.enabled,
        origins: [representative.origin],
      });
      continue;
    }
    const members = ordered.filter(
      (candidate) => candidate === representative || sharesPackage(representative, candidate),
    );
    const origins = members.map((candidate) => candidate.origin);
    nodes.set(key, {
      type: representative.type,
      name: representative.name,
      identity: representative.identity,
      authority: "sourced",
      // The declared source is the direct declaration's when there is one,
      // else the first Pack route's; the range is never folded into it.
      source: representative.source,
      enabled: members.length === 1 ? representative.enabled : isDesiredExtensionActive(origins),
      origins,
    });
  }

  // Acquisition is settled; now bind the source-less settings entries to the
  // identities the Packs supplied. A preference never creates a node, never
  // adds a constraint, and never resurrects a member no reachable Pack
  // supplies — it only adjusts the member that is already there. Membership
  // is proven by any configured Pack's manifest, active or not; while any
  // Pack's membership is unknown, orphanhood is unprovable and not reported.
  const provenMembership = new Set(
    packMembership.flatMap((membership) =>
      membership.declared.status === "known"
        ? membership.declared.members.map((member) => desiredNodeKey(member.type, member.name))
        : [],
    ),
  );
  const membershipIncomplete = packMembership.some(
    (membership) => membership.declared.status === "unknown",
  );
  for (const [key, preference] of preferences) {
    const node = nodes.get(key);
    if (node === undefined) {
      const [type, ...rest] = key.split(":");
      if (provenMembership.has(key) || membershipIncomplete) continue;
      problems.push({
        type: "member-configuration-unbound",
        extensionType: extensionTypes.find((candidate) => candidate === type) ?? "skill",
        name: rest.join(":"),
        location: preference.location,
      });
      continue;
    }
    nodes.set(key, {
      ...node,
      enabled: effectiveExtensionActivation(node.origins, preference),
      preference,
    });
  }

  // A source not yet bound or accepted has no key, so its connection stands
  // alone until it is: no closure is ever joined by display text.
  const mcpClosuresByKey = new Map<McpSourceKey, DesiredMcpSourceClosure>();
  for (const node of nodes.values()) {
    if (node.type !== "mcp-server" || !isSourcedDesiredExtension(node)) continue;
    const sourceKey = desiredMcpSourceKey(node.identity);
    if (Option.isNone(sourceKey)) continue;
    const key = sourceKey.value;
    const existing = mcpClosuresByKey.get(key);
    mcpClosuresByKey.set(key, {
      key,
      localNames: [...(existing?.localNames ?? []), node.name].sort(),
      origins: [...(existing?.origins ?? []), ...node.origins],
    });
  }

  const mcpSourceClosures = [...mcpClosuresByKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const settled = { nodes: [...nodes.values()], mcpSourceClosures };
  const effectiveByNode = new Map(
    settled.nodes.map((node) => [
      desiredNodeKey(node.type, node.name),
      effectiveDesiredConstraint(settled, node),
    ]),
  );
  const reportedConflicts = new Set<string>();
  for (const node of settled.nodes) {
    const effective = effectiveByNode.get(desiredNodeKey(node.type, node.name));
    if (effective === undefined || Result.isSuccess(effective)) continue;
    // Every local connection of one MCP source closure shares its conflict.
    const conflictKey = `${effective.failure.extensionType}:${effective.failure.name}`;
    if (reportedConflicts.has(conflictKey)) continue;
    reportedConflicts.add(conflictKey);
    problems.push(effective.failure);
  }

  const typeOrder = new Map(extensionTypes.map((type, index) => [type, index]));
  const orderedNodes = settled.nodes
    .map((node): DesiredExtensionNode => ({
      ...node,
      constraint:
        effectiveByNode.get(desiredNodeKey(node.type, node.name)) ?? UNCONSTRAINED_DESIRED_NODE,
    }))
    .sort((left, right) => {
      const leftOrder = typeOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = typeOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder === rightOrder
        ? left.name.localeCompare(right.name)
        : leftOrder - rightOrder;
    });

  return {
    nodes: orderedNodes,
    mcpSourceClosures,
    problems: [...problems].sort((left, right) =>
      problemOrder(left).localeCompare(problemOrder(right)),
    ),
    packMembership: [...packMembership].sort(
      (left, right) =>
        left.pack.localeCompare(right.pack) || left.settingsName.localeCompare(right.settingsName),
    ),
  };
};
