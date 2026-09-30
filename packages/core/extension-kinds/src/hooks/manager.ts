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
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  computePackageContentHash,
  computeMaterializedTreeIntegrity,
  enabledConfiguredEntries,
  computeExtensionPathsForLayout,
  type DesiredStateGraph,
  validatePathSafety,
  MaterializedFileTargetSchema,
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
  projectionGeneration,
  evaluateHookAgentOutcome,
  resolveInstructionsConfig,
  type ProjectionUnitObservation,
  HOOK_FALLBACKS_REGION_OWNER,
  captureAgentOutputAuthority,
  observeProjectionPlans,
  reconcileNativeManagedRegion,
} from "@agentxm/workspace-kernel/projection";
import {
  reconcileNativeHookConfig,
  type HookOwnership,
} from "@agentxm/workspace-kernel/agent-adapters";
import {
  AGENTS as CAPABILITY_AGENTS,
  type Agent as CapabilityAgent,
  type CanonicalHookEventId,
  type CanonicalHookToolId,
  type HookEventMapping,
  type HookEntryDialect,
  installable,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-kernel/operations";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/workspace-kernel/sources";
import {
  makeWorkspaceRelativeSourcePath,
  decodeRelativePathSync,
  makeWorkspaceRelativePath,
} from "@agentxm/extension-model/unstable/path-types";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookBinding,
  type HookManifest,
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

const HOOK_FALLBACKS_REGION = "hook-fallbacks";

const decodeHookManifest = Schema.decodeUnknownEffect(HookManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

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

const hookEventsFor = (agent: CapabilityAgent): ReadonlyArray<HookEventMapping> => {
  const native = agent.capabilities.hook.native;
  return "events" in native ? native.events : [];
};

const targetNativeEventName = (
  agent: CapabilityAgent,
  canonical: CanonicalHookEventId,
): string | undefined =>
  hookEventsFor(agent).find((event) => event.canonical === canonical)?.nativeName;

const hookNativeToolNames = (
  agent: CapabilityAgent,
  canonical: CanonicalHookToolId,
): ReadonlyArray<string> => {
  const native = agent.capabilities.hook.native;
  if (!("tools" in native)) return [];
  return native.tools.filter((tool) => tool.canonical === canonical).map((tool) => tool.nativeName);
};

const interpreterForRuntime = (runtime: HookManifest["runtime"]): string => {
  switch (runtime) {
    case "bash":
      return "bash";
    case "node":
      return "node";
    case "python":
      return "python";
  }
};

const serializeMatcher = (
  writer: HookEntryDialect,
  matcher: string | undefined,
): string | undefined => {
  if (matcher === undefined) return undefined;
  switch (writer.matcherSerialization) {
    case "bare":
    case "glob":
      return matcher;
    case "slash-delimited":
      return `/${matcher}/`;
  }
};

const escapeRegexLiteral = (value: string): string =>
  value.replace(/[\\^$.*+?()[\]{}|]/g, (character) => `\\${character}`);

const targetMatcherRaw = (agent: CapabilityAgent, binding: HookBinding): string | undefined =>
  binding.targets?.[agent.id]?.matcherRaw ?? binding.matcherRaw;

const serializeBindingMatcher = (
  agent: CapabilityAgent,
  writer: HookEntryDialect,
  binding: HookBinding,
): Effect.Effect<string | undefined, HookDefinitionInvalid> => {
  const noMatcher: string | undefined = undefined;
  const raw = targetMatcherRaw(agent, binding);
  if (raw !== undefined) return Effect.succeed(serializeMatcher(writer, raw));

  const tools = binding.match?.tools ?? [];
  if (tools.length === 0) return Effect.succeed(noMatcher);

  const nativeNames = tools.flatMap((tool) => hookNativeToolNames(agent, tool));
  if (nativeNames.length === 0) {
    return Effect.fail(
      new HookDefinitionInvalid({
        detail: `${agent.name} cannot express matcher tool(s): ${tools.join(", ")}.`,
      }),
    );
  }

  return Effect.succeed(serializeMatcher(writer, nativeNames.map(escapeRegexLiteral).join("|")));
};

const serializeTimeout = (
  writer: HookEntryDialect,
  timeoutMs: number | undefined,
): number | undefined => {
  if (timeoutMs === undefined) return undefined;
  switch (writer.timeoutSerialization) {
    case "seconds":
      return Math.ceil(timeoutMs / 1000);
    case "milliseconds":
      return timeoutMs;
  }
};

const appendCommandHookBinding = (
  hooks: Record<string, unknown>,
  agent: CapabilityAgent,
  writer: HookEntryDialect,
  binding: HookBinding,
  hookName: string,
  hookRef: string,
  sourceRoot: string,
  scope: "project" | "user",
  command: string,
  timeoutMs: number | undefined,
): Effect.Effect<void, HookDefinitionInvalid> =>
  Effect.gen(function* () {
    const verdict = installable(agent, binding);
    if (!verdict.installable) {
      return yield* new HookDefinitionInvalid({ detail: verdict.reason });
    }

    const nativeEventName = targetNativeEventName(agent, binding.on);
    if (nativeEventName === undefined) {
      return yield* new HookDefinitionInvalid({
        detail: `${agent.name} does not support ${binding.on}.`,
      });
    }

    const existingGroups = hooks[nativeEventName];
    const groups = Array.isArray(existingGroups) ? [...existingGroups] : [];
    const commandEntry: Record<string, unknown> = {
      type: "command",
      command,
      "x-axm": {
        v: 1,
        managed: true,
        unit: `hook:${hookName}`,
        source: "extension",
        ref: hookRef,
        root: sourceRoot,
        scope,
      },
    };
    if (writer.commandNameSerialization === "manifest") {
      commandEntry["name"] = hookName;
    }
    const timeout = serializeTimeout(writer, timeoutMs);
    if (timeout !== undefined) {
      commandEntry["timeout"] = timeout;
    }

    const group: Record<string, unknown> = {
      hooks: [commandEntry],
    };
    const matcher = yield* serializeBindingMatcher(agent, writer, binding);
    if (matcher !== undefined) {
      group["matcher"] = matcher;
    }
    groups.push(group);
    hooks[nativeEventName] = groups;
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

    const entrypointPath = (packageRoot: string, manifest: HookManifest) =>
      Effect.gen(function* () {
        const absolute = path.resolve(packageRoot, manifest.entrypoint);
        yield* validatePathSafety(path, packageRoot, absolute);
        const exists = yield* fs.exists(absolute).pipe(Effect.orElseSucceed(() => false));
        if (!exists) {
          return yield* new HookDefinitionInvalid({
            detail: `Hook entrypoint does not exist: ${manifest.entrypoint}`,
          });
        }
        const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, absolute);
        if (Option.isNone(workspaceRelative)) {
          return yield* new HookDefinitionInvalid({
            detail: `Hook entrypoint escapes workspace: ${manifest.entrypoint}`,
          });
        }
        return workspaceRelative.value;
      });

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
                const entrypoint = yield* entrypointPath(contributor.packageRoot, manifest);
                const command = `${interpreterForRuntime(manifest.runtime)} ${entrypoint}`;
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
                  command,
                  root: path.relative(baseDir, contributor.packageRoot),
                };
              }),
            { concurrency: 16 },
          ),
        ),
        Effect.map((resolved) => [...resolved].sort((a, b) => a.marker.localeCompare(b.marker))),
      );

    interface RenderedHookContributor {
      readonly name: string;
      readonly marker: string;
      readonly manifest: HookManifest;
      readonly command: string;
      readonly root: string;
    }

    interface HookFallbackContributor extends RenderedHookContributor {
      readonly fallbackAgentIds: ReadonlyArray<string>;
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
      readonly fallbackPath: string;
      readonly contributors: ReadonlyArray<RenderedHookContributor>;
      readonly state: "projected" | "current";
    }): ReadonlyArray<ConfiguredAgentOutcome> =>
      args.contributors
        .flatMap((contributor) =>
          args.configuredAgents.map((agentId): ConfiguredAgentOutcome => {
            const agent = capabilityAgentById(agentId);
            if (agent === undefined) {
              return {
                extensionType: "hook",
                name: contributor.name,
                agentId,
                outcome: "blocked",
                reasonCode: "unknown-agent",
                reason: `Configured agent ${agentId} is absent from the agent capability catalog.`,
              };
            }
            const nativeTarget = args.targets.find((target) => target.agent.id === agentId);
            return evaluateHookAgentOutcome({
              agent,
              manifest: contributor.manifest,
              target: {
                fallbackPath: args.fallbackPath,
                ...(nativeTarget === undefined
                  ? {}
                  : { nativePath: path.relative(baseDir, nativeTarget.configPath) }),
              },
              state: args.state,
            });
          }),
        )
        .sort((left, right) =>
          left.name === right.name
            ? left.agentId.localeCompare(right.agentId)
            : left.name.localeCompare(right.name),
        );

    const renderInstalledHookGroups = (
      target: HookWriterTarget,
      contributors: ReadonlyArray<RenderedHookContributor>,
    ) =>
      Effect.gen(function* () {
        const hooks: Record<string, unknown> = {};
        for (const rendered of contributors) {
          for (const binding of rendered.manifest.bindings) {
            yield* appendCommandHookBinding(
              hooks,
              target.agent,
              target.writer,
              binding,
              rendered.manifest.name,
              rendered.marker,
              rendered.root,
              location.scope,
              rendered.command,
              rendered.manifest.timeoutMs,
            );
          }
        }
        return hooks;
      });

    const hookFallbackTarget = () =>
      Effect.gen(function* () {
        const config = yield* settings.instructionsConfig;
        const resolved = resolveInstructionsConfig(
          Option.isSome(config) && config.value !== false ? config.value : undefined,
        );
        const targetPath = path.resolve(baseDir, resolved.fileName);
        const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, targetPath);
        if (Option.isNone(workspaceRelative)) {
          return yield* new HookDefinitionInvalid({
            detail: `Hook fallback instruction source escapes workspace: ${resolved.fileName}`,
          });
        }
        const { address } = yield* assertNativeMutationWithinRoots(
          nativeAuthorityRoots(
            path,
            { workspaceRoot: baseDir, scope: location.scope },
            location.nativeDirectoryInputs,
          ),
          targetPath,
          "content",
          path.dirname(location.runtimeDir),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new HookDefinitionInvalid({
                detail: `Hook fallback location is not writable: ${targetPath}`,
                cause,
              }),
          ),
        );
        return {
          targetPath: address.referentPath ?? address.entryPath,
          workspaceRelative: workspaceRelative.value,
        };
      });

    const reconcileHookFallback = (
      target: { readonly targetPath: string; readonly workspaceRelative: string },
      input: ProjectionRenderInput<HookFallbackContributor>,
      options: {
        readonly dryRun?: boolean;
        readonly ownership: ReadonlyArray<HookOwnership>;
        readonly eligible: boolean;
        readonly configuredAgentIds: ReadonlyArray<string>;
      },
    ) =>
      Effect.gen(function* () {
        const rendered = input.contributors
          .map(
            (hook) =>
              `### ${hook.manifest.title ?? hook.name}\n\nFor agents without a usable native hook mapping (${hook.fallbackAgentIds.join(", ")}), treat this as a managed advisory rule. After the matching lifecycle event (${hook.manifest.bindings.map((binding) => binding.on).join(", ")}), run \`${hook.command}\` and address any findings before continuing.`,
          )
          .join("\n\n");
        const generation = projectionGeneration([
          "hook-fallback-region-v1",
          target.workspaceRelative,
          HOOK_FALLBACKS_REGION_OWNER,
          ...input.contributors.flatMap((contributor) => [
            contributor.name,
            contributor.marker,
            contributor.command,
            JSON.stringify(contributor.fallbackAgentIds),
            JSON.stringify(contributor.manifest),
          ]),
        ]);
        const { changed, observedRegion, nativeLocation } = yield* reconcileNativeManagedRegion({
          workspaceRoot: baseDir,
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          ownerRoot: path.dirname(location.runtimeDir),
          scope: location.scope,
          targetPath: target.targetPath,
          displayPath: target.workspaceRelative,
          owner: HOOK_FALLBACKS_REGION_OWNER,
          region: HOOK_FALLBACKS_REGION,
          rendered,
          generation,
          contributors: input.contributors.map(({ name, marker, root }) => ({
            name,
            ref: marker,
            root,
            scope: location.scope,
          })),
          ownership: options.ownership,
          eligible: options.eligible,
          configuredAgentIds: options.configuredAgentIds,
          ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
        });
        const fallbackAgentIds = Array.from(
          new Set(input.contributors.flatMap(({ fallbackAgentIds }) => fallbackAgentIds)),
        );
        if (options?.dryRun !== true)
          yield* Ref.update(lastProjection, (prior) => ({
            ...prior,
            nativeLocations: combineNativeLocationOutcomes([
              ...(prior.nativeLocations ?? []),
              {
                ...nativeLocation,
                configuredConsumers: fallbackAgentIds,
                availability: nativeLocation.availability.filter(({ agentId }) =>
                  fallbackAgentIds.includes(agentId),
                ),
              },
            ]),
          }));
        if (options?.dryRun !== true && fallbackAgentIds.length > 0 && rendered.length > 0) {
          yield* Effect.logWarning(
            `Degraded hooks to advisory rules for ${fallbackAgentIds.join(", ")}`,
          );
        }
        return {
          changed,
          materializedTarget: decodeMaterializedTarget({
            target: decodeRelativePathSync(target.workspaceRelative),
            mode: "managed-region",
            region: HOOK_FALLBACKS_REGION,
          }),
          projectionUnitObservation: {
            unitId: "hook:fallback-region",
            nativeLocations: [
              {
                ...nativeLocation,
                configuredConsumers: fallbackAgentIds,
                availability: nativeLocation.availability.filter(({ agentId }) =>
                  fallbackAgentIds.includes(agentId),
                ),
              },
            ],
            path: `${target.workspaceRelative}#${HOOK_FALLBACKS_REGION}`,
            owner: HOOK_FALLBACKS_REGION_OWNER,
            present: Option.isSome(observedRegion),
            current: !changed,
            expectedContributors: input.contributors.map(({ marker }) => marker),
          } satisfies ProjectionUnitObservation,
        };
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
        const rendered = yield* renderInstalledHookGroups(target, args.input.contributors);
        for (const consumer of args.targets.slice(1)) {
          const other = yield* renderInstalledHookGroups(consumer, args.input.contributors);
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
        const fallbackTarget = yield* hookFallbackTarget();
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
        const contributors = [...retained, ...prospective].sort((a, b) =>
          a.marker.localeCompare(b.marker),
        );
        const outcomes = evaluateConfiguredOutcomes({
          configuredAgents,
          targets,
          fallbackPath: fallbackTarget.workspaceRelative,
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
        const fallbackContributors: ReadonlyArray<HookFallbackContributor> = contributors.flatMap(
          (contributor) => {
            const fallbackAgentIds = outcomes
              .filter(
                (outcome) =>
                  outcome.name === contributor.name &&
                  outcome.mechanism === "advisory-fallback" &&
                  (outcome.outcome === "projected" || outcome.outcome === "current"),
              )
              .map(({ agentId }) => agentId);
            return fallbackAgentIds.length === 0 ? [] : [{ ...contributor, fallbackAgentIds }];
          },
        );
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
        const selectFallback = () =>
          Effect.succeed({ contributors: fallbackContributors, exclusions: [] });
        const fallbackAgentIds = Array.from(
          new Set(fallbackContributors.flatMap(({ fallbackAgentIds }) => fallbackAgentIds)),
        );
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
            {
              path: fallbackTarget.workspaceRelative,
              ...(fallbackAgentIds.length === 0 ? {} : { agentIds: fallbackAgentIds }),
            },
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
            // A fallback reader still observes this shared native file. It cannot
            // silently receive a native representation it cannot execute.
            for (const consumer of group) {
              const other = yield* selectNative(consumer.agent.id)();
              if (
                JSON.stringify(selected.contributors.map(({ marker }) => marker)) !==
                JSON.stringify(other.contributors.map(({ marker }) => marker))
              ) {
                return yield* new HookDefinitionInvalid({
                  detail: `Hook consumers require incompatible native/fallback projections at ${target.configPath}`,
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
        const fallbackOptions = {
          ownership,
          configuredAgentIds: configuredAgents,
          eligible:
            fallbackContributors.some(({ name }) =>
              options?.nativeInsertionEligibleNames?.has(name),
            ) ||
            (fallbackAgentIds.length > 0 &&
              fallbackAgentIds.every((id) => options?.nativeInsertionEligibleAgentIds?.has(id))),
        };
        const fallbackPlan = yield* planAggregateProjection({
          unitId: "hook:fallback-region",
          targetFile: fallbackTarget.targetPath,
          graph,
          select: selectFallback,
          adapter: {
            observe: (input) =>
              reconcileHookFallback(fallbackTarget, input, {
                ...fallbackOptions,
                dryRun: true,
              }).pipe(Effect.map(({ projectionUnitObservation }) => projectionUnitObservation)),
            apply: (input) =>
              recordMaterialization(
                reconcileHookFallback(fallbackTarget, input, fallbackOptions),
              ).pipe(Effect.asVoid),
          },
        });
        yield* observeProjectionPlans([fallbackPlan]);
        return [...nativePlans, fallbackPlan];
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
        const fallbackTarget = yield* hookFallbackTarget();
        const graph = proposedGraph ?? (yield* desiredState.graph());
        const locked = yield* lockfile.entries("hook");
        const contributors = yield* selectHookContributors({ graph, locked });
        return evaluateConfiguredOutcomes({
          configuredAgents,
          targets,
          fallbackPath: fallbackTarget.workspaceRelative,
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
        const fallbackTarget = yield* hookFallbackTarget();
        const manifest = yield* readManifestForRef(ref);
        return evaluateConfiguredOutcomes({
          configuredAgents,
          targets,
          fallbackPath: fallbackTarget.workspaceRelative,
          contributors: [
            {
              name: manifest.name,
              marker: formatFqn({ owner: manifest.owner, type: "hook", name: manifest.name }),
              manifest,
              command: "",
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
                const entrypoint = path.resolve(root, manifest.entrypoint);
                yield* validatePathSafety(path, root, entrypoint);
                if (!(yield* fs.exists(entrypoint)))
                  return yield* new HookDefinitionInvalid({
                    detail: `Hook entrypoint does not exist: ${manifest.entrypoint}`,
                  });
                const canonicalPath = computeExtensionPathsForLayout(
                  path.join,
                  currentLayout(),
                  ref,
                  HOOK_EXTENSION_DIR,
                  ref.hook.name,
                ).canonicalPath;
                const commandPath = path.relative(
                  baseDir,
                  path.resolve(canonicalPath, manifest.entrypoint),
                );
                return {
                  name: ref.hook.name,
                  marker: formatFqn({ owner: manifest.owner, type: "hook", name: manifest.name }),
                  manifest,
                  command: `${interpreterForRuntime(manifest.runtime)} ${commandPath}`,
                  root: path.relative(baseDir, canonicalPath),
                  treeIntegrity: yield* computeMaterializedTreeIntegrity(root),
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
        const fallbackTarget = yield* hookFallbackTarget();
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
          agentOutcomes: evaluateConfiguredOutcomes({
            configuredAgents,
            targets,
            fallbackPath: fallbackTarget.workspaceRelative,
            contributors: prepared,
            state: "projected",
          }),
          acquisitions: prepared.map(({ name, treeIntegrity }) => ({ name, treeIntegrity })),
        };
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "PlatformError"
            ? new HookDefinitionInvalid({ detail: "Cannot inspect prepared hook content", cause })
            : cause,
        ),
      );

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
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* new HookDefinitionInvalid({
          detail: `Local hook source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

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
