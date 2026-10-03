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

import * as Result from "effect/Result";
import * as semver from "semver";
import {
  extensionTypes,
  packMemberRegistrySource,
  packMemberVersionRange,
  parseExtensionFqnParts,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
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
  desiredMcpSourceKey,
  sameDesiredPackage,
  type DesiredNodeIdentity,
  type DesiredPackIdentity,
  type DesiredSourceAuthority,
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
import { mcpResolutionKey } from "./mcp-source-identity.js";

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

/** Whether two candidates name one package the graph can merge into one node. */
const sharesPackage = (left: Candidate, right: Candidate): boolean =>
  left.authority !== "inline" &&
  right.authority !== "inline" &&
  sameDesiredPackage(left.identity, right.identity);

/** Settings candidates first, then Pack routes by Pack name: an order the declaration order cannot move. */
const settledCandidateOrder = (left: Candidate, right: Candidate): number => {
  if (left.origin.type !== right.origin.type) return left.origin.type === "settings" ? -1 : 1;
  if (left.origin.type === "pack" && right.origin.type === "pack") {
    return left.origin.pack.fqn.localeCompare(right.origin.pack.fqn);
  }
  return 0;
};

const distinctIdentities = (
  candidates: ReadonlyArray<Candidate>,
): ReadonlyArray<DesiredNodeIdentity> => {
  const byText = new Map<string, DesiredNodeIdentity>();
  for (const candidate of candidates) {
    const text = formatDesiredIdentity(candidate.identity);
    if (!byText.has(text)) byText.set(text, candidate.identity);
  }
  return [...byText.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, identity]) => identity);
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
    const { manifest, contentIdentity } = observed;
    if (
      manifest.owner !== identity.owner ||
      manifest.name !== identity.name ||
      (identity.constraint !== undefined &&
        !semver.satisfies(manifest.version, identity.constraint))
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

    // An enabled external Pack's observed manifest routes members only when
    // its accepted resolution authorizes it; the Pack stays desired and its
    // membership stays known while its routes are withheld.
    let routes: DesiredPackRoutes = packEnabled ? "active" : "dormant";
    if (
      packEnabled &&
      identity.identity.authority !== "workspace" &&
      document?.provenance.kind !== "proposed"
    ) {
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
        manifestPath,
        manifest,
        contentIdentity,
      });
      if (!authorization.authorized) {
        problems.push(authorization.problem);
        routes = "unauthorized";
      }
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
        parsed.type,
        parsed,
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
          manifestPath: relativePath,
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
      unresolved.type === "mcp-server" &&
      unresolved.authority === "sourced" &&
      (unresolved.identity.authority === "path" || unresolved.identity.authority === "git")
    ) {
      const identity = unresolved.identity;
      const matches = Object.entries(inputs.acceptedResolutions.mcpServers ?? {}).filter(
        ([key, entry]) =>
          entry.source.type === identity.authority &&
          key === mcpResolutionKey(entry) &&
          lockEntryMatchesSourceLocator(entry, unresolved.source) &&
          (identity.fqn === undefined ||
            identity.fqn === `${entry.identity.owner}/mcps/${entry.identity.name}`),
      );
      const [accepted] = matches;
      if (matches.length === 1 && accepted !== undefined) {
        const [resolutionKey, entry] = accepted;
        candidate = {
          ...unresolved,
          identity: {
            ...identity,
            resolutionKey,
            fqn: `${entry.identity.owner}/mcps/${entry.identity.name}`,
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

  const mcpClosuresByKey = new Map<string, DesiredMcpSourceClosure>();
  for (const node of nodes.values()) {
    if (node.type === "mcp-server" && isSourcedDesiredExtension(node)) {
      const key = desiredMcpSourceKey(node.identity);
      const existing = mcpClosuresByKey.get(key);
      mcpClosuresByKey.set(key, {
        key,
        localNames: [...(existing?.localNames ?? []), node.name].sort(),
        origins: [...(existing?.origins ?? []), ...node.origins],
      });
    }
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
