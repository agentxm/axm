import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  readExtensionManifest,
  type ExtensionManifest,
  type ManifestError,
} from "@agentxm/extension-content";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";

import type {
  ExtensionFqnParts,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  HookManager,
  KnowledgeManager,
  RuleManager,
  SubagentManager,
  NO_MATERIALIZATION_OBSERVATION,
  type ExtensionManagerFailure,
  type ManagerRequirements,
  type MaterializationObservation,
} from "@agentxm/workspace-kernel/materialization";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  OperationRefused,
} from "@agentxm/workspace-kernel/operations";
import type {
  InstallArtifactPresentation,
  InstallChange,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  computePackageContentHash,
  WorkspaceLocation,
  type PackageContentHashFailed,
} from "@agentxm/workspace-kernel/workspace-state";
import { authoringRefused } from "./errors.js";

export type AuthoredNativeProjection = Pick<
  JobStepArtifact,
  "agentOutcomes" | "nativeLocations" | "targets"
>;

/**
 * The identity a staged manifest declares, as immutable strings a caller that
 * already read the manifest hands to a native preflight instead of the
 * decoded manifest itself.
 */
export interface PreparedManifestFacts {
  readonly owner: ExtensionManifest["owner"];
  readonly name: ExtensionManifest["name"];
  readonly type: ExtensionManifest["type"];
  readonly version: ExtensionManifest["version"];
  readonly description?: string;
}

/** Copy the facts a native preflight uses out of a `readExtensionManifest` result. */
export const preparedManifestFacts = ({
  manifest,
}: {
  readonly manifest: ExtensionManifest;
}): PreparedManifestFacts => ({
  owner: manifest.owner,
  name: manifest.name,
  type: manifest.type,
  version: manifest.version,
  ...(manifest.type === "subagent" && manifest.description !== undefined
    ? { description: manifest.description }
    : {}),
});

/**
 * What a native preflight inspects: the staged package, and optionally the
 * values its caller already settled for that same package in the same
 * boundary.
 *
 * Both values are non-authoritative. Each replaces only the preflight's own
 * read where it would happen, so a supplied manifest is identity-checked as a
 * read one is. The source hash only fills the ref handed to the managers, and
 * no preflight consumer may read `ref.sourceHash` as freshness evidence:
 * staged-byte freshness belongs to publication validation.
 */
interface AuthoredPreflightArgs {
  readonly identity: ExtensionFqnParts;
  readonly packageRoot: string;
  readonly enabled: boolean;
  /** The package hash the caller computed over `packageRoot`. */
  readonly sourceHash?: Effect.Effect<SourceHash, PackageContentHashFailed>;
  /** The facts the caller read from `packageRoot`'s manifest. */
  readonly manifest?: Effect.Effect<PreparedManifestFacts, ManifestError>;
}

/** The staged manifest's facts: the supplied ones when they describe `type`, else a fresh read. */
const stagedManifestFacts = (args: AuthoredPreflightArgs, type: ExtensionType) => {
  const read = readExtensionManifest(args.packageRoot, type).pipe(
    Effect.map(preparedManifestFacts),
  );
  return args.manifest === undefined
    ? read
    : args.manifest.pipe(
        Effect.flatMap((facts) => (facts.type === type ? Effect.succeed(facts) : read)),
      );
};

/** The staged package's hash: the supplied one, else a fresh hash of the staged root. */
const stagedSourceHash = (args: AuthoredPreflightArgs) =>
  args.sourceHash ?? computePackageContentHash(args.packageRoot);

export const preflightAuthoredSubagentProjection = Effect.fn("Authoring.preflightSubagent")(
  function* (args: AuthoredPreflightArgs) {
    if (!args.enabled) return yield* Effect.succeed<AuthoredNativeProjection>({});
    const location = yield* WorkspaceLocation;
    const manifest = yield* stagedManifestFacts(args, "subagent").pipe(
      Effect.mapError((cause) =>
        authoringRefused({
          category: "validation",
          detail: "Prepared subagent manifest is invalid",
          cause,
        }),
      ),
    );
    if (manifest.owner !== args.identity.owner || manifest.name !== args.identity.name) {
      return yield* authoringRefused({
        category: "validation",
        detail: "Prepared subagent identity does not match the requested identity",
      });
    }
    const manager = yield* SubagentManager;
    const ref = {
      refType: "workspace" as const,
      type: "subagent" as const,
      scope: location.scope,
      owner: manifest.owner,
      name: manifest.name,
      version: manifest.version,
      location: args.packageRoot,
      sourceHash: yield* stagedSourceHash(args),
      source: {
        type: "workspace" as const,
        owner: manifest.owner,
        name: manifest.name,
        extensionType: "subagent" as const,
      },
      subagent: { name: manifest.name, description: Option.fromUndefinedOr(manifest.description) },
    };
    // Enabling writes the projection, so a differing file AXM has no record of
    // writing refuses here; the observation below only reports it.
    yield* manager.configuredAgentOutcomesForRef(ref, "projected", {
      sourceRoot: args.packageRoot,
      validateDestinations: true,
    });
    const observation = yield* manager.projectionObservation(ref, { sourceRoot: args.packageRoot });
    const outcomes = (observation.agentOutcomes ?? []).map((outcome) =>
      outcome.outcome === "current" ? { ...outcome, outcome: "projected" as const } : outcome,
    );
    if (
      outcomes.length > 0 &&
      !outcomes.some((outcome) => outcome.outcome === "projected" || outcome.outcome === "current")
    ) {
      return yield* authoringRefused({
        category: "validation",
        detail: `No configured runtime can materialize this subagent: ${outcomes.map((outcome) => `${outcome.agentId}: ${outcome.reason}`).join("; ")}`,
      });
    }
    const path = yield* Path.Path;
    return {
      agentOutcomes: outcomes,
      nativeLocations: observation.nativeLocations ?? [],
      targets: (observation.nativeLocations ?? []).map(
        (unit) =>
          ({
            path: path.relative(location.baseDir, unit.address.path),
            change:
              unit.state === "created"
                ? "created"
                : unit.state === "unchanged"
                  ? "unchanged"
                  : "updated",
            agentIds: unit.configuredConsumers,
          }) satisfies JobStepArtifactTarget,
      ),
    } satisfies AuthoredNativeProjection;
  },
);

/** Inspect staged content against final native destinations before publishing its source. */
export const preflightAuthoredNativeProjection = (
  args: AuthoredPreflightArgs,
): Effect.Effect<
  AuthoredNativeProjection,
  OperationRefused | ExtensionManagerFailure,
  ManagerRequirements | RuleManager | HookManager | KnowledgeManager | SubagentManager
> =>
  Effect.gen(function* () {
    if (args.identity.type === "subagent") return yield* preflightAuthoredSubagentProjection(args);
    if (!args.enabled || !["hook", "rule", "knowledge", "subagent"].includes(args.identity.type))
      return {};
    const location = yield* WorkspaceLocation;
    const manifest = yield* stagedManifestFacts(args, args.identity.type).pipe(
      Effect.mapError((cause) =>
        authoringRefused({
          category: "validation",
          detail: "Prepared authored package is not valid",
          cause,
        }),
      ),
    );
    if (
      manifest.owner !== args.identity.owner ||
      manifest.name !== args.identity.name ||
      manifest.type !== args.identity.type
    ) {
      return yield* authoringRefused({
        category: "validation",
        detail: "Prepared authored package identity does not match the requested identity",
      });
    }
    const details = {
      refType: "workspace" as const,
      scope: location.scope,
      owner: manifest.owner,
      name: manifest.name,
      version: manifest.version,
      location: args.packageRoot,
      sourceHash: yield* stagedSourceHash(args),
    };
    const options = { nativeInsertionEligibleNames: new Set<string>() };
    const source = { type: "workspace" as const, owner: manifest.owner, name: manifest.name };
    switch (manifest.type) {
      case "rule":
        yield* (yield* RuleManager).prepareProjection(
          [
            {
              ...details,
              type: "rule",
              source: { ...source, extensionType: "rule" },
              rule: { name: manifest.name },
            },
          ],
          options,
        );
        break;
      case "hook":
        yield* (yield* HookManager).prepareProjection(
          [
            {
              ...details,
              type: "hook",
              source: { ...source, extensionType: "hook" },
              hook: { name: manifest.name },
            },
          ],
          options,
        );
        break;
      case "knowledge":
        yield* (yield* KnowledgeManager).prepareProjection(
          [
            {
              ...details,
              type: "knowledge",
              source: { ...source, extensionType: "knowledge" },
              knowledge: { name: manifest.name },
            },
          ],
          options,
        );
        break;
    }
    return {};
  });

/** Attach actual native observations after the authored transition has settled. */
export const authoredNativeArtifact = (args: {
  readonly type: ExtensionType;
  readonly artifact: JobStepArtifact;
  readonly change: InstallChange;
  readonly projected: boolean;
  readonly materialization?: Option.Option<{ readonly observation: MaterializationObservation }>;
}): Effect.Effect<
  InstallArtifactPresentation,
  ExtensionManagerFailure,
  ManagerRequirements | RuleManager | HookManager | KnowledgeManager
> =>
  Effect.gen(function* () {
    const observation =
      args.materialization !== undefined && Option.isSome(args.materialization)
        ? args.materialization.value.observation
        : !args.projected
          ? NO_MATERIALIZATION_OBSERVATION
          : args.type === "rule"
            ? yield* (yield* RuleManager).aggregateProjectionObservation
            : args.type === "hook"
              ? yield* (yield* HookManager).aggregateProjectionObservation
              : args.type === "knowledge"
                ? yield* (yield* KnowledgeManager).aggregateProjectionObservation
                : NO_MATERIALIZATION_OBSERVATION;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const targetPaths = new Set<string>();
    const targets = [
      ...(args.artifact.targets ?? []),
      ...observation.targets.map((target) => ({ ...target, change: args.change })),
    ].filter((target) => {
      const absolute = path.resolve(location.baseDir, target.path);
      if (targetPaths.has(absolute)) return false;
      targetPaths.add(absolute);
      return true;
    });
    return {
      ...args.artifact,
      ...(observation.agentOutcomes === undefined
        ? {}
        : { agentOutcomes: observation.agentOutcomes }),
      ...(observation.agents.length === 0 ? {} : { agents: observation.agents }),
      ...(observation.nativeLocations === undefined
        ? {}
        : { nativeLocations: observation.nativeLocations }),
      targets,
    } satisfies InstallArtifactPresentation;
  });
