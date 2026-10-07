import { resolveHookImplementation } from "@agentxm/extension-model/unstable/hooks/resolution";
import { platform } from "node:os";
import { retireCanonicalDirectory } from "@agentxm/workspace-kernel/acquisition";
import {
  type HookManagerService,
  acceptedResolutionFor,
  NO_MATERIALIZATION_OBSERVATION,
  type HookMaterializationFacts,
  HookManager,
  acquireCanonicalForRef,
  verifyWorkspaceRefLocation,
  makeBaseManagerMembers,
  listMaterializableFromAccepted,
  type NativeProjectionOptions,
} from "@agentxm/workspace-kernel/materialization";

/**
 * Hook manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  computePackageContentHash,
  hookConfigurationHash,
  readHookEvidence,
  computeMaterializedTreeIntegrity,
  enabledConfiguredEntries,
  computeExtensionPathsForLayout,
  type DesiredStateGraph,
  validatePathSafety,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-kernel/workspace-state";

import { fromFileLocation } from "@agentxm/host-primitives";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as RcMap from "effect/RcMap";
import * as Schema from "effect/Schema";
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
  observeProjectionPlans,
} from "@agentxm/workspace-kernel/projection";
import {
  reconcileNativeHookConfig,
  renderNativeHookGroup,
  type HookOwnership,
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
  ConfiguredAgentOutcome,
  HookEvidenceStatus,
} from "@agentxm/workspace-kernel/operations";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/workspace-kernel/sources";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookBinding,
  type HookManifest,
  type HookConfigurationValue,
  type HookConfigurationValues,
  type HookValue,
  resolveHookConfiguration,
  requiredHookRuntimeFiles,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import {
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
  assertNoPhysicalOverlap,
  combineNativeLocationOutcomes,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
} from "@agentxm/workspace-kernel/locations";

const decodeHookManifest = Schema.decodeUnknownEffect(HookManifestSchema);

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

      targets.push({
        agent,
        writer: hook.native.entryDialect,
        settingsKey,
        declaredPath,
        configPath: address.referentPath ?? address.entryPath,
        format: configFile.format,
      });
    }
    return targets;
  });

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
  implementationIds: ReadonlyArray<string>,
  hookName: string,
  hookRef: string,
  sourceRoot: string,
  scope: "project" | "user",
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
      metadata: {
        v: 1,
        managed: true,
        unit: `hook:${hookName}`,
        source: "extension",
        ref: hookRef,
        root: sourceRoot,
        scope,
        implementationIds,
        binding: binding.id,
      },
    });
    groups.push(group);
    hooks[binding.event] = groups;
  });

export const HookManagerLive = Layer.effect(
  HookManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const desiredState = yield* DesiredStateReader;
    const records = yield* WorkspaceRecords;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const catalog = yield* WorkspaceCatalog;
    const baseDir = location.baseDir;

    // The workspace state ports and source integration are this layer's own
    // dependencies; the platform stays in `R` for every member.
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(WorkspaceLocation, location),
        Effect.provideService(SettingsReader, settings),
        Effect.provideService(LockfileReader, lockfile),
        Effect.provideService(DesiredStateReader, desiredState),
        Effect.provideService(WorkspaceRecords, records),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(WorkspaceCatalog, catalog),
      );

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
    // the same hook packages, so without this the remove+copy steps race on one
    // package dir.
    const materializePackage = (
      ref: HookExtensionRef,
      force = false,
      nativeInsertionEligible = false,
    ) =>
      Effect.scoped(
        Effect.flatMap(
          RcMap.get(packageMaterializeLocks, `${baseDir}\u0000${ref.hook.name}`),
          (lock) =>
            lock.withPermits(1)(materializePackageUnlocked(ref, force, nativeInsertionEligible)),
        ),
      );

    const materializePackageUnlocked = (
      ref: HookExtensionRef,
      force: boolean,
      nativeInsertionEligible: boolean,
    ) =>
      Effect.gen(function* () {
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          currentLayout(),
          ref,
          HOOK_EXTENSION_DIR,
          ref.name,
        ).canonicalPath;
        if (ref.refType === "workspace") {
          yield* verifyWorkspaceRefLocation({
            ref,
            scope: location.scope,
            canonicalPath,
            invalid: (detail) => new HookDefinitionInvalid({ detail }),
          });
          return {
            packageRoot: ref.location,
            treeIntegrity: yield* provide(computeMaterializedTreeIntegrity(ref.location)),
          };
        }
        return yield* acquireCanonicalForRef({
          ref,
          type: "hook",
          baseDir,
          canonicalPath,
          accepted: yield* lockfile.entry("hook", ref.hook.name),
          force,
          nativeInsertionEligible,
          copyFailure: {
            code: "validation",
            detail: (target) => `Failed to copy hook package files to ${target}`,
          },
        });
      });

    const readManifest = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, HOOK_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              new HookDefinitionInvalid({
                detail: `Failed to parse ${HOOK_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeHookManifest(content)),
        Effect.mapError(
          (error) =>
            new HookDefinitionInvalid({
              detail: `Failed to read ${HOOK_MANIFEST_FILENAME}`,
              cause: error,
            }),
        ),
      );

    const validatePackageFiles = (packageRoot: string, manifest: HookManifest) =>
      Effect.forEach(
        requiredHookRuntimeFiles(manifest),
        (entry) =>
          Effect.gen(function* () {
            const absolute = path.resolve(packageRoot, entry);
            yield* validatePathSafety(path, packageRoot, absolute);
            const exists = yield* fs.exists(absolute).pipe(
              Effect.mapError(
                (cause) =>
                  new HookDefinitionInvalid({
                    detail: `Cannot inspect Hook package file: ${entry}`,
                    cause,
                  }),
              ),
            );
            if (!exists)
              return yield* new HookDefinitionInvalid({
                detail: `Hook package file does not exist: ${entry}`,
              });
            const canonicalRoot = yield* fs.realPath(packageRoot);
            const canonicalFile = yield* fs.realPath(absolute);
            yield* validatePathSafety(path, canonicalRoot, canonicalFile);
            const stat = yield* fs.stat(canonicalFile);
            if (stat.type !== "File")
              return yield* new HookDefinitionInvalid({
                detail: `Hook package resource is not a file: ${entry}`,
              });
          }),
        { discard: true },
      ).pipe(
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
    }) =>
      provide(
        activeContributors({
          layout: currentLayout(),
          type: "hook",
          graph: args.graph,
          accepted: args.locked,
        }),
      ).pipe(
        Effect.flatMap((contributors) =>
          Effect.forEach(
            contributors,
            (contributor) =>
              Effect.gen(function* () {
                const manifest = yield* readManifest(contributor.packageRoot);
                yield* validatePackageFiles(contributor.packageRoot, manifest);
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
                return {
                  name: contributor.node.name,
                  marker,
                  manifest,
                  configuration:
                    (yield* settings.entries("hook"))[contributor.node.name]?.configuration ?? {},
                  root: path.relative(baseDir, contributor.packageRoot),
                  contentHash: yield* computePackageContentHash(contributor.packageRoot),
                };
              }),
            { concurrency: 1 },
          ),
        ),
        Effect.map((resolved) => [...resolved].sort((a, b) => a.marker.localeCompare(b.marker))),
      );

    interface RenderedHookContributor {
      readonly name: string;
      readonly marker: string;
      readonly manifest: HookManifest;
      readonly configuration?: HookConfigurationValues;
      readonly contentHash?: string;
      readonly root: string;
    }

    const readManifestForRef = (ref: HookExtensionRef) =>
      ref.refType === "registry"
        ? Effect.scoped(
            sources.fetch(ref).pipe(Effect.flatMap(({ directory }) => readManifest(directory))),
          )
        : readManifest(fromFileLocation(ref.location));

    const evaluateConfiguredOutcomes = (args: {
      readonly configuredAgents: ReadonlyArray<string>;
      readonly targets: ReadonlyArray<HookWriterTarget>;
      readonly contributors: ReadonlyArray<RenderedHookContributor>;
      readonly state: "projected" | "current";
    }) =>
      Effect.gen(function* () {
        const entries = yield* settings.entries("hook");
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
              if (contributor.contentHash !== undefined && Result.isSuccess(resolved)) {
                const canonical = path.resolve(baseDir, contributor.root);
                const packageRoot = (yield* fs.exists(canonical))
                  ? yield* fs.realPath(canonical)
                  : canonical;
                fixtureEvidence = yield* readHookEvidence({
                  runtimeDir: location.runtimeDir,
                  packageRoot,
                  contentHash: contributor.contentHash,
                  configurationHash: hookConfigurationHash(resolved.success),
                  scope: location.scope,
                }).pipe(
                  Effect.catch(() =>
                    Effect.succeed<HookEvidenceStatus>({
                      state: "invalid",
                      reason: "The local fixture receipt could not be read",
                    }),
                  ),
                );
              }
              return args.configuredAgents.map((agentId): ConfiguredAgentOutcome => {
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
            }),
          { concurrency: 1 },
        );
        return groups
          .flat()
          .sort((left, right) =>
            left.name === right.name
              ? left.agentId.localeCompare(right.agentId)
              : left.name.localeCompare(right.name),
          );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new HookDefinitionInvalid({
              detail: "Hook inspection could not read canonical evidence",
              cause,
            }),
        ),
      );

    const renderInstalledHookGroups = (
      target: HookWriterTarget,
      contributors: ReadonlyArray<RenderedHookContributor>,
      physicalReaders: ReadonlyArray<HookWriterTarget>,
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
          // A shared physical entry carries every reader's implementation identity. The
          // caller still compares each reader's complete native rendering before writing.
          const implementationIds = new Set<string>();
          for (const reader of physicalReaders) {
            if (!isConfigurableAgentId(reader.agent.id))
              return yield* new HookDefinitionInvalid({
                detail: `Unsupported Hook protocol ${reader.agent.id}`,
              });
            const resolution = resolveHookImplementation(rendered.manifest, reader.agent.id, {
              scope: location.scope,
              platform: platform(),
            });
            if (resolution.status === "unsupported" || resolution.status === "ambiguous")
              return yield* new HookDefinitionInvalid({
                detail: `Hook ${rendered.name} has no unique compatible implementation for ${reader.agent.id}`,
              });
            implementationIds.add(resolution.implementation.id);
          }
          const entry = (yield* settings.entries("hook"))[rendered.name];
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
              [...implementationIds].sort(),
              rendered.manifest.name,
              rendered.marker,
              rendered.root,
              location.scope,
              command,
            );
          }
        }
        return hooks;
      });

    const reconcileNativeHookTarget = (args: {
      readonly targets: ReadonlyArray<HookWriterTarget>;
      readonly input: ProjectionRenderInput<RenderedHookContributor>;
      readonly ownership: ReadonlyArray<HookOwnership>;
      readonly nativeInsertionEligibleNames: ReadonlySet<string>;
      readonly configuredAgentIds: ReadonlyArray<string>;
      readonly dryRun?: boolean;
    }) =>
      Effect.gen(function* () {
        const target = args.targets[0];
        if (target === undefined)
          return yield* new HookDefinitionInvalid({
            detail: "Hook location has no configured reader",
          });
        const rendered = yield* renderInstalledHookGroups(
          target,
          args.input.contributors,
          args.targets,
        );
        for (const consumer of args.targets.slice(1)) {
          const other = yield* renderInstalledHookGroups(
            consumer,
            args.input.contributors,
            args.targets,
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
          ownership: args.ownership,
          nativeInsertionEligibleNames: args.nativeInsertionEligibleNames,
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
          present: outcome.ownedNames.length > 0,
          current: !outcome.changed,
          expectedContributors: args.input.contributors
            .filter(({ name }) => outcome.expectedNames.includes(name))
            .map(({ marker }) => marker),
          observedContributors: args.input.contributors
            .filter(({ name }) => outcome.observedNames.includes(name))
            .map(({ marker }) => marker),
        } satisfies ProjectionUnitObservation;
      });

    const makeHookProjectionPlans = (
      prospective: ReadonlyArray<RenderedHookContributor> = [],
      options?: NativeProjectionOptions,
    ) =>
      Effect.gen(function* () {
        const configuredAgents = options?.configuredAgents ?? (yield* settings.configuredAgents);
        const targets = yield* configuredHookWriterTargets(
          configuredAgents,
          location.scope,
          baseDir,
          path.dirname(location.runtimeDir),
          location.nativeDirectoryInputs,
        );
        const graph = options?.desiredGraph ?? (yield* desiredState.graph());
        const locked = yield* lockfile.entries("hook");
        const retained = yield* selectHookContributors({
          graph: {
            ...graph,
            nodes: graph.nodes.filter(
              (node) => node.type !== "hook" || !prospective.some(({ name }) => name === node.name),
            ),
          },
          locked,
        });
        const contributors = [...retained, ...prospective]
          .map((contributor) => {
            const configuration = options?.hookConfigurations?.get(contributor.name);
            return configuration === undefined ? contributor : { ...contributor, configuration };
          })
          .sort((a, b) => a.marker.localeCompare(b.marker));
        const outcomes = yield* evaluateConfiguredOutcomes({
          configuredAgents,
          targets,
          contributors,
          state: "projected",
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
        const acceptedOwnership = (yield* captureAgentOutputAuthority()).expectedHooks;
        const ownership: ReadonlyArray<HookOwnership> = [
          ...acceptedOwnership,
          ...(options?.priorAuthority?.expectedHooks ?? []),
          ...contributors.map(({ name, marker, root }) => ({
            name,
            ref: marker,
            root,
            scope: location.scope,
          })),
        ].filter(
          (owner, index, owners) =>
            owners.findIndex(
              (candidate) =>
                candidate.name === owner.name &&
                candidate.ref === owner.ref &&
                candidate.root === owner.root &&
                candidate.scope === owner.scope,
            ) === index,
        );
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
            const newPhysicalRoute =
              options?.nativeInsertionEligibleAgentIds !== undefined &&
              group.every(({ agent }) => options.nativeInsertionEligibleAgentIds?.has(agent.id));
            const nativeArgs = {
              targets: group,
              ownership,
              configuredAgentIds: configuredAgents,
              nativeInsertionEligibleNames: new Set([
                ...(options?.nativeInsertionEligibleNames ?? []),
                ...(newPhysicalRoute ? selected.contributors.map(({ name }) => name) : []),
              ]),
            };
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
        yield* observeProjectionPlans(nativePlans);
        return nativePlans;
      });

    const configuredAgentOutcomes = (
      state: "projected" | "current",
      proposedGraph?: DesiredStateGraph,
    ) =>
      Effect.gen(function* () {
        const configuredAgents = yield* settings.configuredAgents;
        const targets = yield* configuredHookWriterTargets(
          configuredAgents,
          location.scope,
          baseDir,
          path.dirname(location.runtimeDir),
          location.nativeDirectoryInputs,
        );
        const graph = proposedGraph ?? (yield* desiredState.graph());
        const locked = yield* lockfile.entries("hook");
        const contributors = yield* selectHookContributors({ graph, locked });
        return yield* evaluateConfiguredOutcomes({
          configuredAgents,
          targets,
          contributors,
          state,
        });
      });

    const configuredAgentOutcomesForRef = (ref: HookExtensionRef, state: "projected" | "current") =>
      Effect.gen(function* () {
        const configuredAgents = yield* settings.configuredAgents;
        const targets = yield* configuredHookWriterTargets(
          configuredAgents,
          location.scope,
          baseDir,
          path.dirname(location.runtimeDir),
          location.nativeDirectoryInputs,
        );
        const manifest = yield* readManifestForRef(ref);
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

    const prepareProjection = (
      refs: ReadonlyArray<HookExtensionRef>,
      options?: NativeProjectionOptions,
    ) =>
      Effect.gen(function* () {
        const prepared = yield* Effect.forEach(
          refs,
          (ref) =>
            Effect.scoped(
              Effect.gen(function* () {
                const root =
                  ref.refType === "registry"
                    ? (yield* sources.fetch(ref)).directory
                    : fromFileLocation(ref.location);
                const manifest = yield* readManifest(root);
                yield* validatePackageFiles(root, manifest);
                const canonicalPath = computeExtensionPathsForLayout(
                  path.join,
                  currentLayout(),
                  ref,
                  HOOK_EXTENSION_DIR,
                  ref.hook.name,
                ).canonicalPath;
                return {
                  name: ref.hook.name,
                  marker: formatFqn({ owner: manifest.owner, type: "hook", name: manifest.name }),
                  manifest,
                  root: path.relative(baseDir, canonicalPath),
                  treeIntegrity: yield* computeMaterializedTreeIntegrity(root),
                  contentHash: yield* computePackageContentHash(root),
                  configuration:
                    options?.hookConfigurations?.get(ref.hook.name) ??
                    (yield* settings.entries("hook"))[ref.hook.name]?.configuration ??
                    {},
                  inputRoot: root,
                };
              }),
            ),
          { concurrency: 1 },
        );
        const configuredAgents = options?.configuredAgents ?? (yield* settings.configuredAgents);
        const targets = yield* configuredHookWriterTargets(
          configuredAgents,
          location.scope,
          baseDir,
          path.dirname(location.runtimeDir),
          location.nativeDirectoryInputs,
        );
        const plans = yield* makeHookProjectionPlans(prepared, options);
        for (const contributor of prepared)
          for (const plan of plans) {
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
        return {
          plans,
          agentOutcomes: yield* evaluateConfiguredOutcomes({
            configuredAgents,
            targets,
            contributors: prepared,
            state: "projected",
          }),
          acquisitions: prepared.map(({ name, treeIntegrity }) => ({ name, treeIntegrity })),
        };
      });

    const projectionPlans: HookManagerService["projectionPlans"] = (options) =>
      makeHookProjectionPlans([], options);
    const applyHookProjections = projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));

    const materializeInstall: HookManagerService["materializeInstall"] = Effect.fn(
      "HookManager.materializeInstall",
    )(function* ({ ref, force, nativeInsertionEligible }) {
      const materialized = yield* materializePackage(ref, force === true, nativeInsertionEligible);
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

      const sourceHash = yield* computePackageContentHash(packageRoot);
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

    // Canonical removal only. The shared operation flow re-renders the hook
    // units after settings and lock removal, once the target has left the graph.
    const withdrawn: HookMaterializationFacts = {
      observation: NO_MATERIALIZATION_OBSERVATION,
      treeIntegrity: Option.none(),
      acquired: Option.none(),
    };
    const materializeUninstall: HookManagerService["materializeUninstall"] = Effect.fn(
      "HookManager.materializeUninstall",
    )(function* ({ target }) {
      const canonical = yield* provide(
        acceptedCanonicalObservation({
          type: "hook",
          name: target.name,
        }),
      );
      const packageRoot = removableAcceptedCanonicalPath(canonical);
      if (Option.isSome(packageRoot)) {
        yield* retireCanonicalDirectory(packageRoot.value);
      }
      return withdrawn;
    });
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole unit set drops this hook's entries.
    const materializeDeactivate: HookManagerService["materializeDeactivate"] = Effect.fn(
      "HookManager.materializeDeactivate",
    )(() => applyHookProjections.pipe(Effect.as(withdrawn)));

    return {
      projectionPlans,
      prepareProjection,
      aggregateProjectionObservation: Ref.get(lastProjection),
      configuredAgentOutcomes,
      configuredAgentOutcomesForRef,
      ...makeBaseManagerMembers({
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
          names: settings
            .entries("hook")
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

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    };
  }),
);
