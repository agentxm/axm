import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as semver from "semver";

import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { parseRegistrySourcePatternParts } from "@agentxm/client-core/unstable/extensions";
import type {
  ConfiguredRecordRow,
  DesiredExtensionOrigin,
  DesiredStateGraph,
} from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations, configuredRowsByName } from "@agentxm/client-core/unstable/workspace";

export type TargetedUpdateBlocker =
  | "not-desired"
  | "disabled"
  | "pack-owned-constraint"
  | "incomplete-graph"
  | "constraint-conflict"
  | "source-authority"
  | "stale-plan";

export type TargetedUpdateAuthority = "direct" | "pack-aware" | "blocked";
export type TargetedUpdateOwnership = "absent" | "direct-only" | "pack-only" | "combined";
export type TargetedUpdateEffect = "unchanged" | "may-update";

export interface TargetedUpdatePublicContext {
  readonly target: {
    readonly type: Exclude<
      import("@agentxm/client-core/unstable/extensions").InstallableExtensionType,
      "pack"
    >;
    readonly name: string;
    readonly fqn: string;
  };
  readonly ownership: TargetedUpdateOwnership;
  readonly activation: "enabled" | "disabled";
  readonly authority: TargetedUpdateAuthority;
  readonly direct?: {
    readonly source: "registry" | "workspace";
    readonly enabled: boolean;
    readonly constraint?: string;
  };
  readonly packs: ReadonlyArray<{
    readonly fqn: string;
    readonly configuredName?: string;
    readonly source?: "registry" | "workspace";
    readonly memberSource: "registry" | "workspace";
    readonly constraint: string;
    readonly enabled: boolean;
  }>;
  readonly effectiveConstraint?: string;
  readonly memberClosure: ReadonlyArray<{
    readonly type: Exclude<
      import("@agentxm/client-core/unstable/extensions").InstallableExtensionType,
      "pack"
    >;
    readonly name: string;
    readonly fqn: string;
  }>;
  readonly effects: {
    readonly settings: TargetedUpdateEffect;
    readonly acceptedResolution: TargetedUpdateEffect;
    readonly canonical: TargetedUpdateEffect;
    readonly projection: TargetedUpdateEffect;
    readonly packRoot: TargetedUpdateEffect;
    readonly packManifest: TargetedUpdateEffect;
  };
  readonly relevantProblems: ReadonlyArray<string>;
  readonly blocker?: TargetedUpdateBlocker;
}

export interface TargetedUpdateContext {
  readonly public: TargetedUpdatePublicContext;
  readonly fingerprint: string;
  readonly packEvidenceFingerprint: string;
}

interface TargetedUpdateTarget {
  readonly type: TargetedUpdatePublicContext["target"]["type"];
  readonly name: string;
  readonly fqn: string;
}

interface ClassifyTargetedUpdateArgs {
  readonly target: TargetedUpdateTarget;
  readonly explicitRange?: string;
  readonly graph: DesiredStateGraph;
  readonly configuredPacks: ReadonlyArray<ConfiguredRecordRow>;
  readonly configuredOwner?: string;
  readonly packEvidence?: ReadonlyArray<unknown>;
}

const normalizedIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const sourceAuthority = (source: string): "registry" | "workspace" =>
  isWorkspaceSourceLocator(source) ? "workspace" : "registry";

const configuredPackFqn = (
  entry: ConfiguredRecordRow,
  configuredOwner?: string,
): string | undefined => {
  if (entry.source === "registry" || isWorkspaceSourceLocator(entry.source)) {
    return configuredOwner === undefined ? undefined : `${configuredOwner}/packs/${entry.name}`;
  }
  const source = normalizedIdentity(entry.source);
  const parsed = parseRegistrySourcePatternParts(source);
  return parsed?.type === "packs" && parsed.name !== undefined
    ? `${parsed.owner}/packs/${parsed.name}`
    : undefined;
};

const intersectConstraints = (constraints: ReadonlyArray<string>): string | undefined => {
  if (constraints.length === 0) return "";
  let intersections = [""];
  for (const constraint of constraints) {
    const validRange = semver.validRange(constraint);
    if (validRange === null) return undefined;
    const range = new semver.Range(validRange);
    intersections = intersections.flatMap((current) =>
      range.set.flatMap((comparators) => {
        const candidate = [current, ...comparators.map((comparator) => comparator.value)]
          .filter((part) => part.length > 0)
          .join(" ");
        return semver.minVersion(candidate) === null ? [] : [candidate];
      }),
    );
    if (intersections.length === 0) return undefined;
  }
  return intersections.join(" || ");
};

const originConstraint = (origin: DesiredExtensionOrigin): string | undefined => origin.constraint;

const blockedEffects = {
  settings: "unchanged",
  acceptedResolution: "unchanged",
  canonical: "unchanged",
  projection: "unchanged",
  packRoot: "unchanged",
  packManifest: "unchanged",
} as const satisfies TargetedUpdatePublicContext["effects"];

const plannedEffects = (
  authority: Exclude<TargetedUpdateAuthority, "blocked">,
  explicitRange: string | undefined,
): TargetedUpdatePublicContext["effects"] => ({
  settings: authority === "direct" && explicitRange !== undefined ? "may-update" : "unchanged",
  acceptedResolution: "may-update",
  canonical: "may-update",
  projection: "may-update",
  packRoot: "unchanged",
  packManifest: "unchanged",
});

const publicFingerprint = (value: unknown): string =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const classifyTargetedUpdate = (args: ClassifyTargetedUpdateArgs): TargetedUpdateContext => {
  const node = args.graph.nodes.find(
    (candidate) =>
      candidate.type === args.target.type &&
      candidate.name === args.target.name &&
      normalizedIdentity(candidate.identity) === args.target.fqn,
  );
  const globalProblems = args.graph.problems.filter((problem) => problem.type.startsWith("pack-"));
  const targetProblems = args.graph.problems.filter(
    (problem) =>
      (problem.type === "projection-collision" || problem.type === "constraint-conflict") &&
      problem.extensionType === args.target.type &&
      problem.name === args.target.name,
  );
  const relevantProblems = [...globalProblems, ...targetProblems];
  const directOrigin = node?.origins.find((origin) => origin.type === "settings");
  const packOrigins = (node?.origins ?? [])
    .filter(
      (origin): origin is Extract<DesiredExtensionOrigin, { readonly type: "pack" }> =>
        origin.type === "pack",
    )
    .sort((left, right) => left.pack.localeCompare(right.pack));
  const ownership: TargetedUpdateOwnership =
    directOrigin === undefined
      ? packOrigins.length === 0
        ? "absent"
        : "pack-only"
      : packOrigins.length === 0
        ? "direct-only"
        : "combined";
  const packs = packOrigins.map((origin) => {
    const configured = args.configuredPacks.find(
      (entry) => configuredPackFqn(entry, args.configuredOwner) === normalizedIdentity(origin.pack),
    );
    return {
      fqn: normalizedIdentity(origin.pack),
      ...(configured === undefined ? {} : { configuredName: configured.name }),
      ...(configured === undefined
        ? {}
        : {
            source: sourceAuthority(configured.source),
          }),
      memberSource: sourceAuthority(origin.source),
      constraint: origin.constraint,
      enabled: origin.enabled,
    };
  });
  const direct =
    directOrigin === undefined
      ? undefined
      : {
          source: sourceAuthority(directOrigin.source),
          enabled: directOrigin.enabled,
          ...(directOrigin.constraint === undefined ? {} : { constraint: directOrigin.constraint }),
        };
  const constraints = [
    ...(directOrigin === undefined
      ? []
      : [args.explicitRange ?? originConstraint(directOrigin)].filter(
          (constraint): constraint is string => constraint !== undefined,
        )),
    ...packOrigins.map((origin) => origin.constraint),
  ];
  const intersection = intersectConstraints(constraints);
  const activation = node?.enabled === true ? "enabled" : "disabled";
  let blocker: TargetedUpdateBlocker | undefined;
  if (relevantProblems.length > 0) {
    blocker = targetProblems.some((problem) => problem.type === "constraint-conflict")
      ? "constraint-conflict"
      : "incomplete-graph";
  } else if (node === undefined) {
    blocker = "not-desired";
  } else if (!node.enabled) {
    blocker = "disabled";
  } else if (
    direct?.source === "workspace" ||
    packOrigins.some((origin) => isWorkspaceSourceLocator(origin.source))
  ) {
    blocker = "source-authority";
  } else if (ownership === "pack-only" && args.explicitRange !== undefined) {
    blocker = "pack-owned-constraint";
  } else if (intersection === undefined) {
    blocker = "constraint-conflict";
  }

  const authority: TargetedUpdateAuthority =
    blocker !== undefined ? "blocked" : directOrigin === undefined ? "pack-aware" : "direct";
  const publicContext: TargetedUpdatePublicContext = {
    target: args.target,
    ownership,
    activation,
    authority,
    ...(direct === undefined ? {} : { direct }),
    packs,
    ...(intersection === undefined || intersection.length === 0
      ? {}
      : { effectiveConstraint: intersection }),
    memberClosure: node === undefined ? [] : [args.target],
    effects:
      authority === "blocked" ? blockedEffects : plannedEffects(authority, args.explicitRange),
    relevantProblems: relevantProblems.map((problem) => problem.type).sort(),
    ...(blocker === undefined ? {} : { blocker }),
  };

  return {
    public: publicContext,
    fingerprint: publicFingerprint({
      publicContext,
      directSource: directOrigin?.source,
      packSources: packOrigins.map((origin) => origin.source),
      packEvidence: args.packEvidence ?? [],
    }),
    packEvidenceFingerprint: publicFingerprint(args.packEvidence ?? []),
  };
};

export const resolveTargetedUpdateContext = (args: {
  readonly target: TargetedUpdateTarget;
  readonly explicitRange?: string;
}) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const graph = yield* workspace.getDesiredStateGraph();
    const configuredPacks = yield* workspace.records
      .rows("pack")
      .pipe(Effect.map((rows) => Object.values(configuredRowsByName(rows))));
    const configuredOwner = yield* workspace.getConfiguredOwner();
    const baseArgs = {
      target: args.target,
      ...(args.explicitRange === undefined ? {} : { explicitRange: args.explicitRange }),
      graph,
      configuredPacks,
      ...(Option.isNone(configuredOwner) ? {} : { configuredOwner: configuredOwner.value }),
    };
    const preliminary = classifyTargetedUpdate(baseArgs);
    const packEvidence = yield* Effect.all(
      preliminary.public.packs.map((pack) =>
        Effect.gen(function* () {
          const packNode = graph.nodes.find(
            (candidate) =>
              candidate.type === "pack" && normalizedIdentity(candidate.identity) === pack.fqn,
          );
          if (packNode === undefined) return { fqn: pack.fqn, accepted: "absent" };
          const accepted = yield* workspace.getLockedPack(packNode.name);
          return {
            fqn: pack.fqn,
            accepted: Option.getOrUndefined(accepted) ?? "absent",
          };
        }),
      ),
    );
    return classifyTargetedUpdate({ ...baseArgs, packEvidence });
  });
