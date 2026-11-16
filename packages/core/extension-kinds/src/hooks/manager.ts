import { resolveHookImplementation } from "@agentxm/extension-model/unstable/hooks/resolution";
import { platform } from "node:os";
import {
  sourceRefContentKey,
  retireCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";
import {
  type HookManagerService,
  acceptedResolutionFor,
  NO_MATERIALIZATION_OBSERVATION,
  type HookMaterializationFacts,
  HookManager,
  acquireCanonicalForRef,
  verifyWorkspaceRefLocation,
  captureManagerServices,
  makeBaseManagerMembers,
  listMaterializableFromAccepted,
  type ExtensionManagerFailure,
  type ManagerRequirements,
  type NativeProjectionOptions,
  type PreparedHookWriterRoutes,
} from "@agentxm/workspace-kernel/materialization";

/**
 * Hook manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import {
  computePackageContentHash,
  hookConfigurationHash,
  readHookEvidence,
  computeMaterializedTreeIntegrity,
  computeMaterializedTreeDigests,
  DesiredStateReader,
  enabledConfiguredEntries,
  computeExtensionPathsForLayout,
  type DesiredStateGraph,
  validatePathSafety,
  acceptedCanonicalObservation,
  capturedManifestFor,
  removableAcceptedCanonicalPath,
  usableAcceptedCanonical,
  workspaceReadPhaseFor,
} from "@agentxm/workspace-kernel/workspace-state";

import { fromFileLocation } from "@agentxm/host-primitives";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as RcMap from "effect/RcMap";
import * as Semaphore from "effect/Semaphore";
import { HookDefinitionInvalid } from "./errors.js";
import {
  activeContributors,
  applyProjectionPlans,
  planAggregateProjection,
  type ProjectionRenderInput,
  evaluateHookAgentOutcome,
  type ProjectionUnitObservation,
  captureAgentOutputAuthority,
  agentOutputAuthorityFrom,
  nativePackageReferences,
  withObservedProjectionPlans,
  type ObservedProjectionPlans,
} from "@agentxm/workspace-kernel/projection";
import {
  reconcileNativeHookConfig,
  renderNativeHookGroup,
  type HookNativeDeclaration,
} from "@agentxm/workspace-kernel/agent-adapters";
import {
  AGENTS as CAPABILITY_AGENTS,
  type Agent as CapabilityAgent,
  type HookEntryDialect,
  installable,
  isConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type {
  AcceptedContentObservation,
  ConfiguredAgentOutcome,
  HookEvidenceStatus,
} from "@agentxm/workspace-kernel/operations";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  type HookBinding,
  type HookManifest,
  type HookConfigurationValue,
  type HookConfigurationValues,
  type HookValue,
  resolveHookConfiguration,
  requiredHookRuntimeFiles,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { readExtensionManifest } from "@agentxm/extension-content";
import {
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
  assertNoPhysicalOverlap,
  combineNativeLocationOutcomes,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
} from "@agentxm/workspace-kernel/locations";

interface HookWriterTarget {
  readonly agent: CapabilityAgent;
  readonly writer: HookEntryDialect;
  readonly settingsKey: string;
  readonly configPath: string;
  readonly declaredPath: string;
  readonly format: "json" | "jsonc";
}

const capabilityAgentById = (id: string): CapabilityAgent | undefined =>
  CAPABILITY_AGENTS.find((agent) => agent.id === id);

const configuredHookWriterTargets = (
  configuredAgents: ReadonlyArray<string>,
  scope: "project" | "user",
  nativeRoot: string,
  ownerRoot: string,
  inputs: NativeDirectoryInputs,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const targets: HookWriterTarget[] = [];
    for (const id of configuredAgents) {
      const agent = capabilityAgentById(id);
      const hook = agent?.capabilities.hook;
      if (agent === undefined || hook === undefined) continue;

      if (
        !("locations" in hook.native) ||
        hook.axm.writer === null ||
        hook.native.entryDialect === null
      )
        continue;

      const locationIds = hook.axm.writer.locationIds;
      const configFile = hook.native.locations.find(
        (file) =>
          locationIds.includes(file.id) &&
          file.scope === scope &&
          (file.format === "json" || file.format === "jsonc") &&
          !file.gitignored,
      );
      if (
        configFile === undefined ||
        (configFile.format !== "json" && configFile.format !== "jsonc")
      )
        continue;
      const settingsKey = configFile.keyPath?.[0];
      if (configFile.keyPath?.length !== 1 || settingsKey === undefined)
        return yield* new HookDefinitionInvalid({
          detail: `Hook writer location ${configFile.id} has no supported key path`,
        });
      const declared = resolveNativeReadLocation(
        path,
        id,
        configFile,
        { workspaceRoot: nativeRoot, scope },
        inputs,
      );
      if (declared === undefined) continue;
      const declaredPath = declared.path;
      const { address } = yield* assertNativeMutationWithinRoots(
        nativeAuthorityRoots(path, { workspaceRoot: nativeRoot, scope }, inputs),
        declaredPath,
        "content",
        ownerRoot,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new HookDefinitionInvalid({
              detail: `Hook native location is not writable: ${declaredPath}`,
              cause,
            }),
        ),
      );

      targets.push(
        Object.freeze({
          agent,
          writer: hook.native.entryDialect,
          settingsKey,
          declaredPath,
          configPath: address.referentPath ?? address.entryPath,
          format: configFile.format,
        }),
      );
    }
    return Object.freeze(targets);
  });

/**
 * The writer routes one manager resolved in one preparation, for that same
 * manager's later decisions inside its caller's call. Frozen, like the
 * targets and agents it carries.
 */
class IssuedHookWriterRoutes implements PreparedHookWriterRoutes {
  readonly _tag = "PreparedHookWriterRoutes";
  readonly issuer: object;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<HookWriterTarget>;

  constructor(
    issuer: object,
    configuredAgents: ReadonlyArray<string>,
    targets: ReadonlyArray<HookWriterTarget>,
  ) {
    this.issuer = issuer;
    this.configuredAgents = configuredAgents;
    this.targets = targets;
    Object.freeze(this);
  }
}

/** One desired-state evaluation, as this manager's reader returns it. */
type DesiredStateEvaluation = Effect.Success<
  ReturnType<Context.Service.Shape<typeof DesiredStateReader>["evaluate"]>
>;

/** What a caller hands a configured-agent outcome evaluation from its own call. */
type ConfiguredOutcomeOptions = NonNullable<
  Parameters<NonNullable<HookManagerService["configuredAgentOutcomesForRef"]>>[2]
>;

const sameAgents = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

/** The caller's hash from this same boundary when its root matches exactly; otherwise hashed here. */
const preparedContentHash = (
  prepared: NativeProjectionOptions["preparedContentHashes"],
  name: string,
  packageRoot: string,
): Effect.Effect<
  string,
  Effect.Error<ReturnType<typeof computePackageContentHash>>,
  Effect.Services<ReturnType<typeof computePackageContentHash>>
> => {
  const entry = prepared?.get(name);
  return entry !== undefined && entry.packageRoot === packageRoot
    ? Effect.succeed(entry.contentHash)
    : computePackageContentHash(packageRoot);
};

/**
 * One fixture receipt status read inside one owner call, with every input the
 * read depends on in that call: the package location, its content, and its
 * effective configuration.
 */
interface FixtureEvidenceReading {
  readonly root: string;
  readonly contentHash: string;
  readonly configurationHash: string;
  readonly status: HookEvidenceStatus;
}

/** The value itself, deeply frozen, for a value its owner hands on and no longer changes. */
const deepFreeze = <T>(value: T): T => {
  const freeze = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  };
  freeze(value);
  return value;
};

/** A deeply frozen copy, so a recorded value cannot change after it was recorded. */
const deepFrozenCopy = <T>(value: T): T => deepFreeze(structuredClone(value));

/** One owner call's outcomes in name and agent order, as every Hook outcome evaluation returns them. */
const sortedOutcomes = (
  groups: ReadonlyArray<ReadonlyArray<ConfiguredAgentOutcome>>,
): Array<ConfiguredAgentOutcome> =>
  groups
    .flat()
    .sort((left, right) =>
      left.name === right.name
        ? left.agentId.localeCompare(right.agentId)
        : left.name.localeCompare(right.name),
    );

/**
 * What one preparation's projected evaluation decided, for the rest of that
 * same call: the configured agents and writer routes it evaluated with, and
 * each prospective contributor's outcomes by its position, absent where the
 * evaluation left that contributor out. Deeply frozen.
 */
interface ProjectedEvaluation {
  readonly configuredAgents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<HookWriterTarget>;
  readonly prospectiveOutcomes: ReadonlyArray<ReadonlyArray<ConfiguredAgentOutcome> | undefined>;
}

const quoteShell = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

const valueShell = (
  value: HookValue,
  configuration: Readonly<Record<string, HookConfigurationValue>>,
): Effect.Effect<string, HookDefinitionInvalid> => {
  const resolved =
    typeof value === "object" && "config" in value ? configuration[value.config] : value;
  if (resolved === undefined)
    return Effect.fail(
      new HookDefinitionInvalid({
        detail: `Hook command references missing configuration: ${typeof value === "object" && "config" in value ? value.config : "unknown"}`,
      }),
    );
  return Effect.succeed(
    typeof resolved === "object"
      ? `"\${${resolved.env}:?Required hook environment variable is missing}"`
      : quoteShell(String(resolved)),
  );
};

const commandForBinding = (
  binding: HookBinding,
  entrypoint: string,
  configuration: Readonly<Record<string, HookConfigurationValue>>,
) =>
  Effect.gen(function* () {
    const args = yield* Effect.forEach(binding.handler.args ?? [], (value) =>
      valueShell(value, configuration),
    );
    const env = yield* Effect.forEach(Object.entries(binding.handler.env ?? {}), ([name, value]) =>
      valueShell(value, configuration).pipe(Effect.map((serialized) => `${name}=${serialized}`)),
    );
    const runtime = binding.handler.runtime === "python" ? "python3" : binding.handler.runtime;
    return [...env, runtime, quoteShell(entrypoint), ...args].join(" ");
  });

const appendCommandHookBinding = (
  hooks: Record<string, unknown>,
  agent: CapabilityAgent,
  writer: HookEntryDialect,
  binding: HookBinding,
  hookName: string,
  command: string,
): Effect.Effect<void, HookDefinitionInvalid> =>
  Effect.gen(function* () {
    const verdict = installable(agent, binding);
    if (!verdict.installable) return yield* new HookDefinitionInvalid({ detail: verdict.reason });
    const existing = hooks[binding.event];
    const groups = Array.isArray(existing) ? [...existing] : [];
    const group = renderNativeHookGroup(writer, {
      command,
      matcher: binding.matcher,
      timeoutMs: binding.handler.timeoutMs,
      name: binding.handler.name ?? `${hookName}:${binding.id}`,
    });
    groups.push(group);
    hooks[binding.event] = groups;
  });

export const HookManagerLive = Layer.effect(
  HookManager,
  Effect.gen(function* () {
    const { location, settings, lockfile, desiredState, records, sources, provide, provideRead } =
      yield* captureManagerServices;
    const planningSettings = workspaceReadPhaseFor(location).pipe(
      Effect.map((phase) => phase?.readers.settings ?? settings),
    );
    /** The configured Hook entries, read through the planning settings. */
    const hookEntriesRead = planningSettings.pipe(
      Effect.flatMap((current) => current.entries("hook")),
    );
    /**
     * One read of the configured Hook entries for the rest of one owner call:
     * it reads where its first consumer needs it, and every later consumer in
     * that call takes the same deeply frozen value, or the same failure.
     */
    const sharedHookEntries = Effect.cached(
      hookEntriesRead.pipe(
        Effect.map((entries) => (Object.isFrozen(entries) ? entries : deepFrozenCopy(entries))),
      ),
    );
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = location.baseDir;
    // Writer routes this manager issued are read back only by this manager.
    const routeIssuer = {};

    // Active materializations and waiters retain a package key; the map closes
    // with this manager layer.
    const packageMaterializeLocks = yield* RcMap.make({
      lookup: (_key: string) => Semaphore.make(1),
    });

    // The hook units are aggregates: they render after desired state commits,
    // so the closure reads back what the render projected.
    const lastProjection = yield* Ref.make(NO_MATERIALIZATION_OBSERVATION);

    // Serialize re-materialization of the same package within a process: sync
    // renders every agent target concurrently, and each render pass materializes
    // the same hook extensions, so without this the remove+copy steps race on one
    // package dir.
    const materializePackage = (
      ref: HookExtensionRef,
      force: boolean,
      nativeInsertionEligible: boolean,
      frameContentHash: boolean,
    ) =>
      Effect.scoped(
        Effect.flatMap(
          RcMap.get(packageMaterializeLocks, `${baseDir}\u0000${ref.hook.name}`),
          (lock) =>
            lock.withPermits(1)(
              materializePackageUnlocked(ref, force, nativeInsertionEligible, frameContentHash),
            ),
        ),
      );

    /**
     * The package root and its materialized-tree integrity. A workspace
     * package's strict walk also frames its package content hash when
     * `frameContentHash` is set; every other package hashes nothing here.
     */
    const materializePackageUnlocked = (
      ref: HookExtensionRef,
      force: boolean,
      nativeInsertionEligible: boolean,
      frameContentHash: boolean,
    ) =>
      Effect.gen(function* () {
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          currentLayout(),
          ref,
          "hooks",
          ref.name,
        ).canonicalPath;
        if (ref.refType === "workspace") {
          yield* verifyWorkspaceRefLocation({
            ref,
            scope: location.scope,
            canonicalPath,
            invalid: (detail) => new HookDefinitionInvalid({ detail }),
          });
          if (!frameContentHash)
            return {
              packageRoot: ref.location,
              treeIntegrity: yield* provide(computeMaterializedTreeIntegrity(ref.location)),
              contentHash: Option.none<SourceHash>(),
            };
          const digests = yield* provide(computeMaterializedTreeDigests(ref.location));
          return {
            packageRoot: ref.location,
            treeIntegrity: digests.treeIntegrity,
            contentHash: Option.some(digests.contentHash),
          };
        }
        const acquired = yield* acquireCanonicalForRef({
          ref,
          type: "hook",
          baseDir,
          canonicalPath,
          accepted: yield* lockfile.entry("hook", ref.hook.name),
          force,
          nativeInsertionEligible,
          copyFailure: {
            code: "validation",
            detail: (target) => `Failed to copy hook extension files to ${target}`,
          },
        });
        return {
          packageRoot: acquired.packageRoot,
          treeIntegrity: acquired.treeIntegrity,
          contentHash: Option.none<SourceHash>(),
        };
      });

    const readManifest = (packageRoot: string) =>
      readExtensionManifest(packageRoot, "hook").pipe(
        Effect.map(({ manifest }) => manifest),
        Effect.mapError((cause) => new HookDefinitionInvalid({ detail: cause.detail, cause })),
      );

    const validatePackageFiles = (packageRoot: string, manifest: HookManifest) =>
      Effect.gen(function* () {
        // The package root's real path, resolved when the first file needs it
        // and held for the rest of this call; each file is still resolved,
        // contained and inspected on its own.
        const resolvedRoot = yield* Effect.cached(fs.realPath(packageRoot));
        const runtimeFiles = requiredHookRuntimeFiles(manifest);
        yield* Effect.forEach(
          runtimeFiles,
          (entry) =>
            Effect.gen(function* () {
              const absolute = path.resolve(packageRoot, entry);
              yield* validatePathSafety(path, packageRoot, absolute);
              const exists = yield* fs.exists(absolute).pipe(
                Effect.mapError(
                  (cause) =>
                    new HookDefinitionInvalid({
                      detail: `Cannot inspect Hook extension file: ${entry}`,
                      cause,
                    }),
                ),
              );
              if (!exists)
                return yield* new HookDefinitionInvalid({
                  detail: `Hook extension file does not exist: ${entry}`,
                });
              const canonicalRoot = yield* resolvedRoot;
              const canonicalFile = yield* fs.realPath(absolute);
              yield* validatePathSafety(path, canonicalRoot, canonicalFile);
              const stat = yield* fs.stat(canonicalFile);
              if (stat.type !== "File")
                return yield* new HookDefinitionInvalid({
                  detail: `Hook extension resource is not a file: ${entry}`,
                });
            }),
          { discard: true },
        );
        // The root's real path once every runtime file was found contained in
        // it; none when no file needed it.
        return runtimeFiles.length === 0
          ? Option.none<ResolvedPackageRoot>()
          : Option.some<ResolvedPackageRoot>(
              Object.freeze({ root: path.resolve(packageRoot), canonical: yield* resolvedRoot }),
            );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new HookDefinitionInvalid({
              detail: "Hook runtime resources must be readable files contained in the package",
              cause,
            }),
        ),
      );

    const selectHookContributors = (args: {
      readonly graph: Parameters<typeof activeContributors>[0]["graph"];
      readonly locked: Parameters<typeof activeContributors>[0]["accepted"];
      readonly preparedContentHashes?: NativeProjectionOptions["preparedContentHashes"];
      /** The owner call's shared read of the configured Hook entries. */
      readonly hookEntries?: typeof hookEntriesRead;
    }) =>
      provideRead(
        activeContributors({
          layout: currentLayout(),
          type: "hook",
          graph: args.graph,
          accepted: args.locked,
          captureManifests: true,
        }),
      ).pipe(
        Effect.flatMap((contributors) =>
          Effect.forEach(
            contributors,
            (contributor) =>
              Effect.gen(function* () {
                // The decode this contributor's observation just made, when it
                // is this package's hook manifest; otherwise the manifest is read.
                const manifest = yield* Option.match(
                  capturedManifestFor(path, contributor.manifest, contributor.packageRoot, "hook"),
                  {
                    onSome: Effect.succeed,
                    onNone: () => readManifest(contributor.packageRoot),
                  },
                );
                const resolvedRoot = yield* validatePackageFiles(contributor.packageRoot, manifest);
                const marker = Option.match(contributor.identityOwner, {
                  onSome: (owner) =>
                    formatFqn({
                      owner,
                      type: "hook",
                      name: decodeExtensionNameSync(contributor.node.name),
                    }),
                  onNone: () =>
                    formatFqn({ owner: manifest.owner, type: "hook", name: manifest.name }),
                });
                const selected: RenderedHookContributor = {
                  name: contributor.node.name,
                  marker,
                  manifest,
                  configuration:
                    (yield* args.hookEntries ?? hookEntriesRead)[contributor.node.name]
                      ?.configuration ?? {},
                  root: path.relative(baseDir, contributor.packageRoot),
                  contentHash: yield* preparedContentHash(
                    args.preparedContentHashes,
                    contributor.node.name,
                    contributor.packageRoot,
                  ),
                };
                return { selected, resolvedRoot };
              }),
            { concurrency: 1 },
          ),
        ),
        Effect.map((resolved) => ({
          contributors: resolved
            .map(({ selected }) => selected)
            .sort((a, b) => a.marker.localeCompare(b.marker)),
          /** The package roots this selection's validation resolved, for this same call. */
          resolvedRoots: Object.freeze(
            resolved.flatMap(({ resolvedRoot }) => Option.toArray(resolvedRoot)),
          ),
        })),
      );

    /**
     * A package root one validation resolved in its owner call: the absolute
     * root it validated and that root's real path.
     */
    interface ResolvedPackageRoot {
      readonly root: string;
      readonly canonical: string;
    }

    interface RenderedHookContributor {
      readonly name: string;
      readonly marker: string;
      readonly manifest: HookManifest;
      readonly configuration?: HookConfigurationValues;
      readonly contentHash?: string;
      readonly root: string;
    }

    /** One observation of the Hook's accepted package, as a frozen fact of what it found. */
    const observeAcceptedHook = (name: string) =>
      usableAcceptedCanonical({ type: "hook", name }).pipe(
        Effect.mapError(
          (cause) =>
            new HookDefinitionInvalid({
              detail: `Accepted hook extension ${name} could not be inspected`,
              cause,
            }),
        ),
        Effect.map((canonical): AcceptedContentObservation =>
          Object.freeze({
            type: "hook",
            name,
            ...(Option.isSome(canonical)
              ? {
                  usable: Object.freeze({
                    path: canonical.value.observation.path,
                    contentKey: sourceRefContentKey(canonical.value.ref),
                  }),
                }
              : {}),
          }),
        ),
      );

    /**
     * The package root a ref is read from, with the accepted-package
     * observation that chose it for a Registry ref. An observation `handed` in
     * by the same owner call for this Hook decides instead of observing again.
     */
    const rootForRef = (
      ref: HookExtensionRef,
      handed?: ReadonlyArray<AcceptedContentObservation>,
    ) =>
      Effect.gen(function* () {
        if (ref.refType !== "registry")
          return { root: fromFileLocation(ref.location), observed: undefined };
        const observed =
          handed?.find(({ type, name }) => type === "hook" && name === ref.hook.name) ??
          (yield* observeAcceptedHook(ref.hook.name));
        if (
          observed.usable !== undefined &&
          observed.usable.contentKey === sourceRefContentKey(ref)
        )
          return { root: observed.usable.path, observed };
        return { root: (yield* sources.fetch(ref)).directory, observed };
      });
    /**
     * The manifest at the ref's root. For a ref that is not a Registry ref, a
     * decode `prepared` by the same owner call for this name and root stands
     * for the read.
     */
    const readManifestForRef = (
      ref: HookExtensionRef,
      handed?: ReadonlyArray<AcceptedContentObservation>,
      prepared?: ConfiguredOutcomeOptions["preparedManifests"],
    ) =>
      Effect.scoped(
        rootForRef(ref, handed).pipe(
          Effect.flatMap(({ root }) => {
            const decoded =
              ref.refType === "registry"
                ? undefined
                : prepared?.find(
                    (entry) => entry.name === ref.hook.name && entry.packageRoot === root,
                  );
            return decoded === undefined ? readManifest(root) : Effect.succeed(decoded.manifest);
          }),
        ),
      );

    /**
     * Configured-agent outcomes with the fixture receipt statuses read for the
     * contributors named in `record`. A contributor matching one of the given
     * `readings` on every input of the read takes a copy of that status
     * instead of reading the receipt again.
     */
    const evaluateConfiguredOutcomesWithEvidence = (args: {
      readonly configuredAgents: ReadonlyArray<string>;
      readonly targets: ReadonlyArray<HookWriterTarget>;
      readonly contributors: ReadonlyArray<RenderedHookContributor>;
      readonly state: "projected" | "current";
      readonly readings?: ReadonlyArray<FixtureEvidenceReading>;
      readonly record?: ReadonlyArray<string>;
      /** The owner call's shared read of the configured Hook entries. */
      readonly hookEntries?: typeof hookEntriesRead;
      /** The package roots the owner call's validation resolved. */
      readonly resolvedRoots?: ReadonlyArray<ResolvedPackageRoot>;
    }) =>
      Effect.gen(function* () {
        const entries = yield* args.hookEntries ?? hookEntriesRead;
        const groups = yield* Effect.forEach(
          args.contributors,
          (contributor) =>
            Effect.gen(function* () {
              const configuration =
                contributor.configuration ?? entries[contributor.name]?.configuration ?? {};
              const resolved = resolveHookConfiguration(contributor.manifest, configuration);
              let fixtureEvidence: HookEvidenceStatus = {
                state: "absent",
                reason: "No local fixture evidence was evaluated for this source",
              };
              let reading: FixtureEvidenceReading | undefined;
              if (contributor.contentHash !== undefined && Result.isSuccess(resolved)) {
                const contentHash = contributor.contentHash;
                const configurationHash = hookConfigurationHash(resolved.success);
                const prior = args.readings?.find(
                  (candidate) =>
                    candidate.root === contributor.root &&
                    candidate.contentHash === contentHash &&
                    candidate.configurationHash === configurationHash,
                );
                if (prior !== undefined) fixtureEvidence = structuredClone(prior.status);
                else {
                  const canonical = path.resolve(baseDir, contributor.root);
                  // The real path this call's validation resolved for exactly
                  // this root; otherwise it is resolved here.
                  const resolved = args.resolvedRoots?.find(({ root }) => root === canonical);
                  const packageRoot =
                    resolved !== undefined
                      ? resolved.canonical
                      : (yield* fs.exists(canonical))
                        ? yield* fs.realPath(canonical)
                        : canonical;
                  fixtureEvidence = yield* readHookEvidence({
                    runtimeDir: location.runtimeDir,
                    packageRoot,
                    contentHash,
                    configurationHash,
                    scope: location.scope,
                  }).pipe(
                    Effect.catch(() =>
                      Effect.succeed<HookEvidenceStatus>({
                        state: "invalid",
                        reason: "The local fixture receipt could not be read",
                      }),
                    ),
                  );
                  if (args.record?.includes(contributor.name) === true)
                    reading = Object.freeze({
                      root: contributor.root,
                      contentHash,
                      configurationHash,
                      status: deepFrozenCopy(fixtureEvidence),
                    });
                }
              }
              const outcomes = args.configuredAgents.map((agentId): ConfiguredAgentOutcome => {
                const agent = capabilityAgentById(agentId);
                if (agent === undefined)
                  return {
                    extensionType: "hook",
                    name: contributor.name,
                    agentId,
                    outcome: "blocked",
                    reasonCode: "unknown-agent",
                    reason: `Configured agent ${agentId} is absent from the agent capability catalog.`,
                  };
                const nativeTarget = args.targets.find((target) => target.agent.id === agentId);
                return evaluateHookAgentOutcome({
                  agent,
                  manifest: contributor.manifest,
                  target:
                    nativeTarget === undefined
                      ? {}
                      : { nativePath: path.relative(baseDir, nativeTarget.configPath) },
                  scope: location.scope,
                  host: { platform: platform() },
                  state: args.state,
                  configuration,
                  fixtureEvidence,
                });
              });
              return { outcomes, reading };
            }),
          { concurrency: 1 },
        );
        const outcomeGroups = groups.map(({ outcomes }) => outcomes);
        return {
          outcomes: sortedOutcomes(outcomeGroups),
          /** Each contributor's outcomes, in the order of `contributors`. */
          groups: outcomeGroups,
          readings: Object.freeze(
            groups.flatMap(({ reading }) => (reading === undefined ? [] : [reading])),
          ),
        };
      }).pipe(
        Effect.mapError(
          (cause) =>
            new HookDefinitionInvalid({
              detail: "Hook inspection could not read canonical evidence",
              cause,
            }),
        ),
      );

    const evaluateConfiguredOutcomes = (
      args: Omit<Parameters<typeof evaluateConfiguredOutcomesWithEvidence>[0], "record">,
    ) => evaluateConfiguredOutcomesWithEvidence(args).pipe(Effect.map(({ outcomes }) => outcomes));

    const renderInstalledHookGroups = (
      target: HookWriterTarget,
      contributors: ReadonlyArray<RenderedHookContributor>,
      hookEntries: typeof hookEntriesRead,
    ) =>
      Effect.gen(function* () {
        const hooks: Record<string, unknown> = {};
        for (const rendered of contributors) {
          if (!isConfigurableAgentId(target.agent.id))
            return yield* new HookDefinitionInvalid({
              detail: `Unsupported Hook protocol ${target.agent.id}`,
            });
          const selected = resolveHookImplementation(rendered.manifest, target.agent.id, {
            scope: location.scope,
            platform: platform(),
          });
          if (selected.status === "unsupported" || selected.status === "ambiguous")
            return yield* new HookDefinitionInvalid({
              detail: `Hook ${rendered.name} has no unique compatible implementation for ${target.agent.id}`,
            });
          const entry = (yield* hookEntries)[rendered.name];
          const values = rendered.configuration ?? entry?.configuration;
          const configuration = resolveHookConfiguration(rendered.manifest, values);
          if (Result.isFailure(configuration))
            return yield* new HookDefinitionInvalid({
              detail: configuration.failure
                .map(({ key, message }) => `${key}: ${message}`)
                .join("; "),
            });
          for (const binding of selected.implementation.bindings) {
            const command = yield* commandForBinding(
              binding,
              path.resolve(baseDir, rendered.root, binding.handler.entrypoint),
              configuration.success,
            );
            yield* appendCommandHookBinding(
              hooks,
              target.agent,
              target.writer,
              binding,
              rendered.manifest.name,
              command,
            );
          }
        }
        return hooks;
      });

    const reconcileNativeHookTarget = (args: {
      readonly targets: ReadonlyArray<HookWriterTarget>;
      readonly input: ProjectionRenderInput<RenderedHookContributor>;
      readonly ownership: ReadonlyArray<HookNativeDeclaration>;
      readonly configuredAgentIds: ReadonlyArray<string>;
      readonly dryRun?: boolean;
    }) =>
      Effect.gen(function* () {
        const target = args.targets[0];
        if (target === undefined)
          return yield* new HookDefinitionInvalid({
            detail: "Hook location has no configured reader",
          });
        // One read of the configured entries for this observation or apply
        // alone, shared by every reader of the file it renders; each later
        // observation or apply reads them again.
        const hookEntries = yield* sharedHookEntries;
        const rendered = yield* renderInstalledHookGroups(
          target,
          args.input.contributors,
          hookEntries,
        );
        for (const consumer of args.targets.slice(1)) {
          const other = yield* renderInstalledHookGroups(
            consumer,
            args.input.contributors,
            hookEntries,
          );
          if (
            consumer.settingsKey !== target.settingsKey ||
            JSON.stringify(rendered) !== JSON.stringify(other)
          ) {
            return yield* new HookDefinitionInvalid({
              detail: `Hook consumers cannot share ${target.configPath}: ${args.targets.map(({ agent }) => agent.id).join(", ")}`,
            });
          }
        }
        const outcome = yield* reconcileNativeHookConfig({
          workspaceRoot: baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          ownerRoot: path.dirname(location.runtimeDir),
          scope: location.scope,
          path: target.configPath,
          aliases: args.targets.map(({ declaredPath }) => declaredPath),
          consumers: args.targets.map(({ agent }) => agent.id),
          settingsKey: target.settingsKey,
          configuredAgentIds: args.configuredAgentIds,
          format: args.targets.some(({ format }) => format === "json") ? "json" : "jsonc",
          rendered,
          ...(target.writer.serializer === "flat-command-stdin"
            ? { configVersion: 1 as const }
            : {}),
          declarations: args.ownership,
          ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
        }).pipe(
          Effect.catchTag("NativeLocationError", (cause) =>
            Effect.fail(
              new HookDefinitionInvalid({
                detail: `Hook native location is not writable: ${target.configPath}`,
                cause,
              }),
            ),
          ),
        );
        if (args.dryRun !== true)
          yield* Ref.update(lastProjection, (prior) => ({
            ...prior,
            nativeLocations: combineNativeLocationOutcomes([
              ...(prior.nativeLocations ?? []),
              outcome.nativeLocation,
            ]),
          }));
        return {
          unitId: "hook:agent-hook-entries",
          nativeLocations: [outcome.nativeLocation],
          path: path.relative(baseDir, target.configPath),
          present: outcome.declaredNames.length > 0,
          current: !outcome.changed,
          expectedContributors: args.input.contributors
            .filter(({ name }) => outcome.expectedNames.includes(name))
            .map(({ marker }) => marker),
          observedContributors: args.input.contributors
            .filter(({ name }) => outcome.observedNames.includes(name))
            .map(({ marker }) => marker),
        } satisfies ProjectionUnitObservation;
      });

    /**
     * Build the hook plans, observe them as the pre-write refusal, and hand
     * that to `use`, with the fixture receipt statuses this call read for the
     * prospective contributors and what its projected evaluation decided.
     */
    const observedHookProjectionPlans = <A, E, R>(
      prospective: ReadonlyArray<RenderedHookContributor>,
      options: NativeProjectionOptions | undefined,
      use: (
        observed: ObservedProjectionPlans<ExtensionManagerFailure, ManagerRequirements>,
        prospectiveEvidence: ReadonlyArray<FixtureEvidenceReading>,
        projected: ProjectedEvaluation,
      ) => Effect.Effect<A, E, R>,
      prepared?: {
        /**
         * The live evaluation the same owner call took through this manager's
         * own reader, with nothing written since; it stands for the plan's own.
         */
        readonly evaluation?: DesiredStateEvaluation;
        /** The package roots the same owner call validated for `prospective`. */
        readonly resolvedRoots?: ReadonlyArray<ResolvedPackageRoot>;
      },
    ) =>
      Effect.gen(function* () {
        const phase = yield* workspaceReadPhaseFor(location);
        const currentSettings = phase?.readers.settings ?? settings;
        const currentLocks = phase?.readers.locks ?? lockfile;
        const configuredAgents =
          options?.configuredAgents ?? (yield* currentSettings.configuredAgents);
        const targets = yield* configuredHookWriterTargets(
          configuredAgents,
          location.scope,
          baseDir,
          path.dirname(location.runtimeDir),
          location.nativeDirectoryInputs,
        );
        // A plan that reads desired state live through the reader its output
        // authority reads evaluates once; the authority is derived from that
        // same evaluation in this call.
        const evaluation =
          options?.desiredGraph === undefined &&
          phase === undefined &&
          (yield* DesiredStateReader) === desiredState
            ? Option.some(prepared?.evaluation ?? (yield* desiredState.evaluate()))
            : Option.none();
        const graph =
          options?.desiredGraph ??
          (Option.isSome(evaluation)
            ? evaluation.value.graph
            : yield* (phase?.readers.desired ?? desiredState).graph());
        const locked = yield* currentLocks.entries("hook");
        // This call's selection and projected evaluation share one read of
        // the configured entries; the plans' observations and applies, and
        // `use`, read their own.
        const hookEntries = yield* sharedHookEntries;
        const selection = yield* selectHookContributors({
          hookEntries,
          graph: {
            ...graph,
            nodes: graph.nodes.filter(
              (node) => node.type !== "hook" || !prospective.some(({ name }) => name === node.name),
            ),
          },
          locked,
          preparedContentHashes: options?.preparedContentHashes,
        });
        const disabledNames = new Set(
          graph.nodes
            .filter((node) => node.type === "hook" && !node.enabled)
            .map((node) => node.name),
        );
        const disabledWithdrawals = (yield* Option.match(evaluation, {
          onNone: () => captureAgentOutputAuthority(),
          onSome: (evaluated) => agentOutputAuthorityFrom(Effect.succeed(evaluated)),
        })).expectedHooks.filter(({ name }) => disabledNames.has(name));
        // Each prospective contributor keeps its position, so its outcomes
        // are found again by position rather than by a name it may share.
        const resolvedRoots = Object.freeze([
          ...selection.resolvedRoots,
          ...(prepared?.resolvedRoots ?? []),
        ]);
        const positioned: ReadonlyArray<{
          readonly contributor: RenderedHookContributor;
          readonly prospectiveIndex?: number;
        }> = [
          ...selection.contributors.map((contributor) => ({ contributor })),
          ...prospective.map((contributor, prospectiveIndex) => ({
            contributor,
            prospectiveIndex,
          })),
        ];
        const evaluated = positioned
          .filter(
            ({ contributor: { name } }) =>
              !options?.hookWithdrawals?.some((declaration) => declaration.name === name),
          )
          .map((entry) => {
            const configuration = options?.hookConfigurations?.get(entry.contributor.name);
            return configuration === undefined
              ? entry
              : { ...entry, contributor: { ...entry.contributor, configuration } };
          })
          .sort((a, b) => a.contributor.marker.localeCompare(b.contributor.marker));
        const contributors = evaluated.map(({ contributor }) => contributor);
        const {
          outcomes,
          groups: outcomeGroups,
          readings,
        } = yield* evaluateConfiguredOutcomesWithEvidence({
          configuredAgents,
          targets,
          contributors,
          state: "projected",
          record: prospective.map(({ name }) => name),
          hookEntries,
          resolvedRoots,
        });
        const blocked = outcomes.filter(({ outcome }) => outcome === "blocked");
        if (blocked.length > 0) {
          return yield* new HookDefinitionInvalid({
            detail: blocked
              .map(
                ({ name, agentId, reason }) => `Hook ${name} is blocked for ${agentId}: ${reason}`,
              )
              .join("; "),
          });
        }
        const projected: ProjectedEvaluation = Object.freeze({
          configuredAgents: Object.freeze([...configuredAgents]),
          targets,
          prospectiveOutcomes: Object.freeze(
            prospective.map((_, index) => {
              const group =
                outcomeGroups[
                  evaluated.findIndex(({ prospectiveIndex }) => prospectiveIndex === index)
                ];
              return group === undefined ? undefined : deepFrozenCopy(group);
            }),
          ),
        });
        // Every reachable Hook contributor is decided from desired state
        // alone, so hook units never exclude one.
        const selectNative = (agentId: string) => () =>
          Effect.succeed({
            contributors: contributors.filter((contributor) =>
              outcomes.some(
                (outcome) =>
                  outcome.name === contributor.name &&
                  outcome.agentId === agentId &&
                  outcome.mechanism === "native" &&
                  (outcome.outcome === "projected" || outcome.outcome === "current"),
              ),
            ),
            exclusions: [],
          });
        const materialization = {
          agents: configuredAgents,
          targets: [
            ...[...new Set(targets.map(({ configPath }) => configPath))]
              .sort()
              .map((configPath) => ({
                path: path.relative(baseDir, configPath),
                agentIds: targets
                  .filter((target) => target.configPath === configPath)
                  .map(({ agent }) => agent.id)
                  .sort(),
              })),
          ],
        };
        const recordMaterialization = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(
            Effect.tap(() =>
              Ref.update(lastProjection, (prior) => ({
                ...materialization,
                nativeLocations: prior.nativeLocations ?? [],
              })),
            ),
          );
        const ownership: ReadonlyArray<HookNativeDeclaration> = [
          ...disabledWithdrawals,
          ...(options?.hookWithdrawals ?? []),
          ...contributors.map(({ name, marker, root }) => ({
            name,
            ref: marker,
            root: path.resolve(baseDir, root),
            scope: location.scope,
          })),
        ];
        const groups = new Map<string, HookWriterTarget[]>();
        for (const target of targets) {
          const group = groups.get(target.configPath) ?? [];
          group.push(target);
          groups.set(target.configPath, group);
        }
        const nativePlans = yield* Effect.forEach([...groups.values()], (group) =>
          Effect.gen(function* () {
            const target = group[0];
            if (target === undefined)
              return yield* new HookDefinitionInvalid({
                detail: "Hook location has no configured reader",
              });
            const selected = yield* selectNative(target.agent.id)();
            // Every configured reader sharing a physical file must accept the same contributors.
            for (const consumer of group) {
              const other = yield* selectNative(consumer.agent.id)();
              if (
                JSON.stringify(selected.contributors.map(({ marker }) => marker)) !==
                JSON.stringify(other.contributors.map(({ marker }) => marker))
              ) {
                return yield* new HookDefinitionInvalid({
                  detail: `Hook consumers require incompatible native projections at ${target.configPath}`,
                });
              }
            }
            const nativeArgs = { targets: group, ownership, configuredAgentIds: configuredAgents };
            const plan = yield* planAggregateProjection({
              unitId: "hook:agent-hook-entries",
              targetFile: target.configPath,
              graph,
              select: () => Effect.succeed(selected),
              adapter: {
                observe: (input) =>
                  reconcileNativeHookTarget({ ...nativeArgs, input, dryRun: true }),
                apply: (input) =>
                  recordMaterialization(reconcileNativeHookTarget({ ...nativeArgs, input })).pipe(
                    Effect.asVoid,
                  ),
              },
            });
            return plan;
          }),
        );
        return yield* withObservedProjectionPlans(nativePlans, (observed) =>
          use(observed, readings, projected),
        );
      });

    const configuredAgentOutcomes = (
      state: "projected" | "current",
      proposedGraph?: DesiredStateGraph,
    ) =>
      Effect.gen(function* () {
        const phase = yield* workspaceReadPhaseFor(location);
        const configuredAgents = yield* (phase?.readers.settings ?? settings).configuredAgents;
        const targets = yield* configuredHookWriterTargets(
          configuredAgents,
          location.scope,
          baseDir,
          path.dirname(location.runtimeDir),
          location.nativeDirectoryInputs,
        );
        const graph = proposedGraph ?? (yield* (phase?.readers.desired ?? desiredState).graph());
        const locked = yield* (phase?.readers.locks ?? lockfile).entries("hook");
        // The selection and the evaluation share one read of the configured entries.
        const hookEntries = yield* sharedHookEntries;
        const { contributors, resolvedRoots } = yield* selectHookContributors({
          graph,
          locked,
          hookEntries,
        });
        return yield* evaluateConfiguredOutcomes({
          configuredAgents,
          targets,
          contributors,
          state,
          hookEntries,
          resolvedRoots,
        });
      });

    const configuredAgentOutcomesForRef: NonNullable<
      HookManagerService["configuredAgentOutcomesForRef"]
    > = (ref, state, options) =>
      Effect.gen(function* () {
        const configuredAgents = yield* (yield* planningSettings).configuredAgents;
        // The routes the caller's preparation resolved in this call, when
        // this manager issued them for these same agents.
        const prepared = options?.writerRoutes;
        const targets =
          prepared instanceof IssuedHookWriterRoutes &&
          prepared.issuer === routeIssuer &&
          sameAgents(prepared.configuredAgents, configuredAgents)
            ? prepared.targets
            : yield* configuredHookWriterTargets(
                configuredAgents,
                location.scope,
                baseDir,
                path.dirname(location.runtimeDir),
                location.nativeDirectoryInputs,
              );
        const manifest = yield* readManifestForRef(
          ref,
          options?.acceptedContent,
          options?.preparedManifests,
        );
        return yield* evaluateConfiguredOutcomes({
          configuredAgents,
          targets,
          contributors: [
            {
              name: manifest.name,
              marker: formatFqn({ owner: manifest.owner, type: "hook", name: manifest.name }),
              manifest,
              root: "",
            },
          ],
          state,
        });
      });

    const observedPrepareProjection: HookManagerService["observedPrepareProjection"] = (
      refs,
      options,
      use,
    ) =>
      Effect.gen(function* () {
        const preparedRefs = yield* Effect.forEach(
          refs,
          (ref) =>
            Effect.scoped(
              Effect.gen(function* () {
                const { root, observed } = yield* rootForRef(ref);
                // The decode the caller made of this same package's hook
                // manifest in this boundary; otherwise the manifest is read.
                const preparedManifest = options?.preparedManifests?.get(ref.hook.name);
                const manifest =
                  preparedManifest !== undefined &&
                  preparedManifest.packageRoot === root &&
                  preparedManifest.manifest.type === "hook"
                    ? preparedManifest.manifest
                    : yield* readManifest(root);
                const validatedRoot = yield* validatePackageFiles(root, manifest);
                const canonicalPath = computeExtensionPathsForLayout(
                  path.join,
                  currentLayout(),
                  ref,
                  "hooks",
                  ref.hook.name,
                ).canonicalPath;
                // The strict tree walk always runs; the package hash is framed
                // from it unless the caller hashed this same root in this boundary.
                const preparedHash = options?.preparedContentHashes?.get(ref.hook.name);
                const { treeIntegrity, contentHash } =
                  preparedHash !== undefined && preparedHash.packageRoot === root
                    ? {
                        treeIntegrity: yield* computeMaterializedTreeIntegrity(root),
                        contentHash: preparedHash.contentHash,
                      }
                    : yield* computeMaterializedTreeDigests(root);
                return {
                  contributor: {
                    name: ref.hook.name,
                    marker: formatFqn({ owner: manifest.owner, type: "hook", name: manifest.name }),
                    manifest,
                    root: path.relative(baseDir, canonicalPath),
                    treeIntegrity,
                    contentHash,
                    configuration:
                      options?.hookConfigurations?.get(ref.hook.name) ??
                      (yield* (yield* planningSettings).entries("hook"))[ref.hook.name]
                        ?.configuration ??
                      {},
                    inputRoot: root,
                  },
                  observed,
                  // The validated root's real path, only when the package was
                  // read from its canonical root, which its evidence is keyed by.
                  resolvedRoot: Option.filter(
                    validatedRoot,
                    ({ root: validated }) => validated === path.resolve(canonicalPath),
                  ),
                  // A Registry package's root may be a fetch released with
                  // this scope, so only other roots' decodes are handed on,
                  // frozen with the contributor that holds the same decode.
                  decoded:
                    ref.refType === "registry"
                      ? undefined
                      : Object.freeze({
                          name: ref.hook.name,
                          packageRoot: root,
                          manifest: deepFreeze(manifest),
                        }),
                };
              }),
            ),
          { concurrency: 1 },
        );
        const prepared = preparedRefs.map(({ contributor }) => contributor);
        const resolvedRoots = Object.freeze(
          preparedRefs.flatMap(({ resolvedRoot }) => Option.toArray(resolvedRoot)),
        );
        // Each manifest decode this call made of a Hook read from its own
        // directory, for the caller's decisions within its own call.
        const preparedManifests = Object.freeze(
          preparedRefs.flatMap(({ decoded }) => (decoded === undefined ? [] : [decoded])),
        );
        // Each observation this call made of a Registry Hook's accepted
        // package, for the caller's decisions within its own call.
        const acceptedContent = Object.freeze(
          preparedRefs.flatMap(({ observed }) => (observed === undefined ? [] : [observed])),
        );
        return yield* observedHookProjectionPlans(
          prepared,
          options,
          (observed, readings, projected) =>
            Effect.gen(function* () {
              for (const contributor of prepared)
                for (const plan of observed.plans) {
                  yield* assertNoPhysicalOverlap(contributor.inputRoot, plan.targetFile).pipe(
                    Effect.mapError(
                      (cause) =>
                        new HookDefinitionInvalid({
                          detail: "Hook native target overlaps its input source",
                          cause,
                        }),
                    ),
                  );
                }
              // The projected evaluation above evaluated these contributors in
              // this call with the same agents, routes and inputs; only those it
              // left out are evaluated here, with the receipts it read.
              const unevaluated = prepared.filter(
                (_, index) => projected.prospectiveOutcomes[index] === undefined,
              );
              const evaluatedHere =
                unevaluated.length === 0
                  ? []
                  : (yield* evaluateConfiguredOutcomesWithEvidence({
                      configuredAgents: projected.configuredAgents,
                      targets: projected.targets,
                      contributors: unevaluated,
                      state: "projected",
                      readings,
                      resolvedRoots,
                    })).groups;
              const agentOutcomes = sortedOutcomes(
                prepared.map((contributor, index) => {
                  const shared = projected.prospectiveOutcomes[index];
                  return shared === undefined
                    ? (evaluatedHere[unevaluated.indexOf(contributor)] ?? [])
                    : structuredClone(shared);
                }),
              );
              return yield* use({
                observed,
                agentOutcomes,
                acquisitions: prepared.map(({ name, treeIntegrity }) => ({ name, treeIntegrity })),
                acceptedContent,
                writerRoutes: new IssuedHookWriterRoutes(
                  routeIssuer,
                  projected.configuredAgents,
                  projected.targets,
                ),
                preparedManifests,
              });
            }),
          { resolvedRoots },
        );
      });
    const prepareProjection: HookManagerService["prepareProjection"] = (refs, options) =>
      observedPrepareProjection(refs, options, ({ observed, agentOutcomes, acquisitions }) =>
        Effect.succeed({ plans: observed.plans, agentOutcomes, acquisitions }),
      );

    const observedProjectionPlans: HookManagerService["observedProjectionPlans"] = (options, use) =>
      observedHookProjectionPlans([], options, (observed) => use(observed));
    const projectionPlans: HookManagerService["projectionPlans"] = (options) =>
      observedProjectionPlans(options, (observed) => Effect.succeed(observed.plans));

    const materializeInstall: HookManagerService["materializeInstall"] = Effect.fn(
      "HookManager.materializeInstall",
    )(function* ({ ref, force, nativeInsertionEligible, preparedSourceHash }) {
      // A caller's hash of this exact workspace package root stands for the
      // hash here: nothing in this install writes the package tree. A
      // workspace package's root is its location.
      const preparedHash =
        ref.refType === "workspace" &&
        preparedSourceHash !== undefined &&
        path.resolve(preparedSourceHash.root) === path.resolve(ref.location)
          ? Option.some(preparedSourceHash.hash)
          : Option.none<SourceHash>();
      const materialized = yield* materializePackage(
        ref,
        force === true,
        nativeInsertionEligible === true,
        Option.isNone(preparedHash),
      );
      const packageRoot = materialized.packageRoot;
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(
              path,
              baseDir,
              ref.sourcePath ?? fromFileLocation(ref.location),
            )
          : Option.none<string>();

      // Otherwise a workspace package's strict walk framed the hash; any
      // other package is hashed here.
      const sourceHash = yield* Option.match(
        Option.orElse(preparedHash, () => materialized.contentHash),
        { onSome: Effect.succeed, onNone: () => computePackageContentHash(packageRoot) },
      );
      return {
        observation: NO_MATERIALIZATION_OBSERVATION,
        treeIntegrity: Option.some(materialized.treeIntegrity),
        acquired: Option.some({
          ref,
          workspaceRelativeLocalSourcePath,
          sourceHash,
          treeIntegrity: materialized.treeIntegrity,
        }),
      } satisfies HookMaterializationFacts;
    });

    // Explicit lifecycle removal selects native registrations before discarding their package.
    const withdrawn: HookMaterializationFacts = {
      observation: NO_MATERIALIZATION_OBSERVATION,
      treeIntegrity: Option.none(),
      acquired: Option.none(),
    };
    /**
     * Withdraw the native registrations the current output authority expects
     * for `name`, re-rendering every other contributor. Read live through this
     * manager's own reader, the desired state is evaluated once for both the
     * withdrawal and its projection run; nothing is written between them.
     */
    const withdrawNativeRegistrations = (name: string) =>
      Effect.gen(function* () {
        const evaluation =
          (yield* workspaceReadPhaseFor(location)) === undefined &&
          (yield* DesiredStateReader) === desiredState
            ? Option.some(yield* desiredState.evaluate())
            : Option.none();
        const hookWithdrawals = (yield* Option.match(evaluation, {
          onNone: () => captureAgentOutputAuthority(),
          onSome: (evaluated) => agentOutputAuthorityFrom(Effect.succeed(evaluated)),
        })).expectedHooks.filter((declaration) => declaration.name === name);
        yield* observedHookProjectionPlans(
          [],
          { hookWithdrawals },
          (observed) => Effect.succeed(observed.plans),
          Option.isSome(evaluation) ? { evaluation: evaluation.value } : undefined,
        ).pipe(Effect.flatMap(applyProjectionPlans));
      });

    const materializeUninstall: HookManagerService["materializeUninstall"] = Effect.fn(
      "HookManager.materializeUninstall",
    )(function* ({ target, nativeCleanup }) {
      if (nativeCleanup !== "retain") yield* withdrawNativeRegistrations(target.name);
      const canonical = yield* provide(
        acceptedCanonicalObservation({
          type: "hook",
          name: target.name,
        }),
      );
      const packageRoot = removableAcceptedCanonicalPath(canonical);
      if (Option.isSome(packageRoot)) {
        const retained = yield* nativePackageReferences({
          workspaceRoot: baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          scope: location.scope,
          packageRoot: packageRoot.value,
        });
        if (retained.length > 0)
          return yield* new HookDefinitionInvalid({
            detail: `Cannot remove Hook package while native registrations still reference it at ${retained.join(", ")}. Remove those exact registrations explicitly, then retry uninstall.`,
          });
        yield* retireCanonicalDirectory(packageRoot.value);
      }
      return withdrawn;
    });
    const materializeDeactivate: HookManagerService["materializeDeactivate"] = Effect.fn(
      "HookManager.materializeDeactivate",
    )(function* ({ target }) {
      yield* withdrawNativeRegistrations(target.name);
      return withdrawn;
    });

    return {
      projectionPlans,
      observedProjectionPlans,
      prepareProjection,
      observedPrepareProjection,
      aggregateProjectionObservation: Ref.get(lastProjection),
      configuredAgentOutcomes,
      configuredAgentOutcomesForRef,
      ...makeBaseManagerMembers({
        location,
        type: "hook",
        spanPrefix: "HookManager",
        records,
        settings,
        refName: (ref) => ref.hook.name,
        materializeInstall,
      }),
      materializeInstall,
      acquireCanonical: materializeInstall,

      /**
       * Every enabled entry's accepted canonical package, read from accepted
       * resolution rather than re-resolved from source. Materialization
       * realizes what the workspace already accepted; going back to the
       * source would put an unrelated configured entry's release age between
       * an operator and the extension they are authoring.
       */
      listMaterializable: () =>
        listMaterializableFromAccepted({
          type: "hook",
          names: workspaceReadPhaseFor(location)
            .pipe(Effect.flatMap((phase) => (phase?.readers.settings ?? settings).entries("hook")))
            .pipe(
              Effect.map((configured) =>
                enabledConfiguredEntries(configured).map(([name]) => name),
              ),
            ),
        }),

      materializeUninstall,
      materializeDeactivate,

      acceptedResolution: ({ ref, materialization }) =>
        acceptedResolutionFor({
          ref,
          acquired: Option.flatMap(materialization, (facts) => facts.acquired),
        }),
    };
  }),
);
