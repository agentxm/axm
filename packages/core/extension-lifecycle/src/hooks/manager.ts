/**
 * Hook manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import {
  HookConfigInvalid,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  HookIoFailed,
  activeContributors,
  applyProjectionPlans,
  planAggregateProjection,
  type ProjectionRenderInput,
  runWithTransientFileBackup,
  reconcileManagedRegionFile,
  projectionGeneration,
  managedHookCommands,
  readManagedHookCommands,
  updateHooksJson,
  evaluateHookAgentOutcome,
  WriteBackupRetained,
  type ExtensionManagerFailure,
  resolveInstructionsConfig,
} from "@agentxm/extension-workspace";
import {
  AGENTS as CAPABILITY_AGENTS,
  type Agent as CapabilityAgent,
  type CanonicalHookEventId,
  type CanonicalHookToolId,
  type HookEventMapping,
  type HooksWriter,
  installable,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { computePackageContentHash } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "@agentxm/workspace-state";
import { type SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import {
  canReuseInstalledPackage,
  enabledConfiguredEntries,
  materializeExternalPackageWithTreeIntegrity,
} from "@agentxm/extension-workspace";
import { materializeRegistryPackageWithTreeIntegrity } from "../registry-materialization.js";
import { computeExtensionPathsForLayout } from "@agentxm/workspace-state";
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-state";
import type { ProjectionUnitObservation } from "@agentxm/extension-workspace";
import { validatePathSafety } from "@agentxm/workspace-state";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "@agentxm/workspace-state";
import type { HookLockEntry } from "@agentxm/workspace-state";
import { MaterializedFileTargetSchema } from "@agentxm/workspace-state";
import { gitSourceLockFields } from "@agentxm/workspace-state";
import { SourceHostProviders, WorkspaceCatalog } from "@agentxm/extension-sources";
import { stripFileProtocol } from "../internal/fs-helpers.js";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import {
  decodeRelativePathSync,
  makeWorkspaceRelativePath,
} from "@agentxm/extension-model/unstable/path-types";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { usableAcceptedCanonicalRef } from "@agentxm/workspace-state";
import { coupleLifecycleDependencyFailure } from "../errors.js";
import { LifecycleFailureAdapter } from "../failure-adapter.js";
import type { ExtensionManager, MaterializationObservation } from "@agentxm/extension-workspace";
import { HOOK_FALLBACKS_REGION_OWNER, HookManager } from "@agentxm/extension-workspace";
import type { ExtensionTarget } from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { isObservedInstalled } from "@agentxm/workspace-state";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-state";
import { protectWorkspacePath } from "@agentxm/workspace-state";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookBinding,
  type HookManifest,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import {
  type GitHostedHookRef,
  type HookExtensionRef,
  type LocalHookRef,
  type RegistryHookRef,
} from "@agentxm/extension-model/unstable/extensions/refs/hook";

const HOOK_FALLBACKS_REGION = "hook-fallbacks";

// Per-package in-process mutex so concurrent re-materialization of the same hook
// package (remove+copy) is serialized rather than racing.
// eslint-disable-next-line no-restricted-syntax -- Process-owned keys are bounded by hook packages touched during this one CLI invocation.
const packageMaterializeLocks = new Map<string, Semaphore.Semaphore>();
const packageMaterializeLockFor = (key: string): Semaphore.Semaphore => {
  const existing = packageMaterializeLocks.get(key);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  packageMaterializeLocks.set(key, created);
  return created;
};

const decodeHookManifest = Schema.decodeUnknownEffect(HookManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

const registryHookLockEntry = (
  ref: RegistryHookRef,
  treeIntegrity: TreeIntegrity,
): HookLockEntry => ({
  type: "registry",
  sourceType: "registry",
  packageFormat: "agentxm",
  endpoint: ref.source.location,
  extensionType: "hook",
  workspaceName: ref.hook.name,
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: ref.source.name,
  publisherBindingId: ref.publisherBindingId,
  treeIntegrity,
});

const gitHookLockEntry = (
  ref: GitHostedHookRef,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
): HookLockEntry => ({
  ...gitSourceLockFields(
    ref.source,
    "hook",
    ref.hook.name,
    Option.fromUndefinedOr(ref.sourcePath),
    ref.gitCommitSha,
    ref.gitTreeSha,
    contentIdentity,
    ref.owner,
    ref.name,
    treeIntegrity,
  ),
});

const localHookLockEntry = (
  ref: LocalHookRef,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
): HookLockEntry => ({
  type: "local",
  sourceType: "local",
  sourceName: "local",
  extensionType: "hook",
  workspaceName: ref.hook.name,
  packageFormat: "agentxm",
  packageOwner: ref.owner,
  packageName: ref.name,
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  contentIdentity,
  treeIntegrity,
});

interface HookWriterTarget {
  readonly agent: CapabilityAgent;
  readonly writer: HooksWriter;
  readonly configPath: string;
}

const capabilityAgentById = (id: string): CapabilityAgent | undefined =>
  CAPABILITY_AGENTS.find((agent) => agent.id === id);

const configuredHookWriterTargets = (
  configuredAgents: ReadonlyArray<string>,
  resolvePath: (path: string) => string,
): Effect.Effect<ReadonlyArray<HookWriterTarget>, HookDefinitionInvalid> =>
  Effect.gen(function* () {
    const targets: HookWriterTarget[] = [];
    for (const id of configuredAgents) {
      const agent = capabilityAgentById(id);
      const hook = agent?.capabilities.hook;
      if (agent === undefined || hook === undefined) continue;

      if (hook.native.availability.via === "none" || hook.axm.writer === null) continue;

      const configFile = hook.axm.writer.configFiles.find(
        (file) => file.scope === "project" && file.format === "json" && !file.gitignored,
      );
      if (configFile === undefined) {
        return yield* new HookDefinitionInvalid({
          detail: `AXM has no project JSON hook writer target for ${agent.name}.`,
        });
      }

      targets.push({
        agent,
        writer: hook.axm.writer,
        configPath: resolvePath(configFile.path),
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

const readExisting = (
  configPath: string,
): Effect.Effect<string, HookIoFailed, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(
      Effect.mapError(
        (error) =>
          new HookIoFailed({
            detail: `Failed to inspect Claude Code hooks config: ${configPath}`,
            cause: error,
          }),
      ),
    );
    if (!exists) return "";
    return yield* fs.readFileString(configPath).pipe(
      Effect.mapError(
        (error) =>
          new HookIoFailed({
            detail: `Failed to read Claude Code hooks config: ${configPath}`,
            cause: error,
          }),
      ),
    );
  });

const writeIfChanged = (
  configPath: string,
  oldRaw: string,
  newRaw: string,
): Effect.Effect<void, ExtensionManagerFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (oldRaw === newRaw) return;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* protectWorkspacePath(configPath);
    yield* fs.makeDirectory(path.dirname(configPath), { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new HookIoFailed({
            detail: `Failed to create hooks config directory: ${path.dirname(configPath)}`,
            cause: error,
          }),
      ),
    );
    yield* runWithTransientFileBackup({
      sourcePath: configPath,
      oldRaw,
      newRaw,
      tempPrefix: "axm-hooks-config-backup-",
      onBackupRetained: (error, backupPath) =>
        new WriteBackupRetained({ backupPath, failure: error }),
      operation: fs.writeFileString(configPath, newRaw).pipe(
        Effect.mapError(
          (error) =>
            new HookIoFailed({
              detail: `Failed to write Claude Code hooks config: ${configPath}`,
              cause: error,
            }),
        ),
      ),
    });
  });

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

const serializeMatcher = (writer: HooksWriter, matcher: string | undefined): string | undefined => {
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
  writer: HooksWriter,
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
  writer: HooksWriter,
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
  writer: HooksWriter,
  binding: HookBinding,
  hookName: string,
  hookRef: string,
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
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const httpClient = yield* HttpClient.HttpClient;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const catalog = yield* WorkspaceCatalog;
    const adapter = yield* LifecycleFailureAdapter;
    const baseDir = ws.baseDir;

    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(HttpClient.HttpClient, httpClient),
      Layer.succeed(Path.Path, path),
    );
    const envLayer = Layer.mergeAll(
      fsPathLayer,
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(WorkspaceCatalog, catalog),
      Layer.succeed(LifecycleFailureAdapter, adapter),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const lastInstallState = new Map<
      string,
      {
        readonly ref: HookExtensionRef;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
        readonly sourceHash: SourceHash;
        readonly treeIntegrity: TreeIntegrity;
      }
    >();
    let lastProjection: MaterializationObservation | undefined;

    const materializeFromRegistry = (ref: RegistryHookRef) =>
      Effect.gen(function* () {
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          ws.layout,
          ref,
          HOOK_EXTENSION_DIR,
          ref.name,
        ).canonicalPath;
        const lockedEntry = yield* ws.getLockedHookEntry(ref.hook.name);
        const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, ref);
        const reuse = yield* provide(
          canReuseInstalledPackage({
            installedPath: canonicalPath,
            force: false,
            refVersion: ref.version,
            hasIntegrity: Option.isSome(ref.integrity),
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) =>
              `Failed to check if canonical hook package path exists: ${target}`,
          }),
        );
        if (reuse && Option.isSome(lockedEntry)) {
          const observedTree = yield* provide(computeMaterializedTreeIntegrity(canonicalPath));
          if (observedTree === lockedEntry.value.treeIntegrity) {
            return { packageRoot: canonicalPath, treeIntegrity: lockedEntry.value.treeIntegrity };
          }
        }
        const materialized = yield* provide(
          materializeRegistryPackageWithTreeIntegrity({
            baseDir,
            destinationPath: canonicalPath,
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "hook",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            messages: {
              integrityMismatchDetail: `Integrity mismatch for hook:${ref.name}@${ref.version}`,
            },
          }),
        );
        return {
          packageRoot: materialized.canonicalPath,
          treeIntegrity: materialized.treeIntegrity,
        };
      });

    const materializeFromExternal = (ref: GitHostedHookRef | LocalHookRef) =>
      provide(
        materializeExternalPackageWithTreeIntegrity({
          baseDir,
          canonicalPath: computeExtensionPathsForLayout(
            path.join,
            ws.layout,
            ref,
            HOOK_EXTENSION_DIR,
            ref.hook.name,
          ).canonicalPath,
          sourceLocation: ref.location,
          copyFailureCode: "validation",
          copyFailureDetail: (canonicalPath) =>
            `Failed to copy hook package files to ${canonicalPath}`,
        }).pipe(
          Effect.map((materialized) => ({
            packageRoot: materialized.canonicalPath,
            treeIntegrity: materialized.treeIntegrity,
          })),
        ),
      );

    // Serialize re-materialization of the same package within a process: sync
    // renders every agent target concurrently, and each render pass materializes
    // the same hook packages, so without this the remove+copy steps race on one
    // package dir.
    const materializePackage = (ref: HookExtensionRef) =>
      packageMaterializeLockFor(`${baseDir}\u0000${ref.hook.name}`).withPermits(1)(
        materializePackageUnlocked(ref),
      );

    const materializePackageUnlocked = (ref: HookExtensionRef) =>
      Effect.gen(function* () {
        switch (ref.refType) {
          case "registry":
            return yield* materializeFromRegistry(ref);
          case "git-hosted":
          case "local":
            return yield* materializeFromExternal(ref);
          case "workspace": {
            const expectedPath = computeExtensionPathsForLayout(
              path.join,
              ws.layout,
              ref,
              HOOK_EXTENSION_DIR,
              ref.name,
            ).canonicalPath;
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* new HookDefinitionInvalid({
                detail: `Invalid workspace hook source location: ${ref.location}`,
              });
            }
            return {
              packageRoot: ref.location,
              treeIntegrity: yield* provide(computeMaterializedTreeIntegrity(ref.location)),
            };
          }
        }
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
      readonly locked: Parameters<typeof activeContributors>[0]["locked"];
    }) =>
      provide(
        activeContributors({
          layout: ws.layout,
          path,
          type: "hook",
          extensionDir: HOOK_EXTENSION_DIR,
          graph: args.graph,
          locked: args.locked,
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
                return { name: contributor.node.name, marker, manifest, command };
              }),
            { concurrency: "unbounded" },
          ),
        ),
        Effect.map((resolved) => [...resolved].sort((a, b) => a.marker.localeCompare(b.marker))),
      );

    interface RenderedHookContributor {
      readonly name: string;
      readonly marker: string;
      readonly manifest: HookManifest;
      readonly command: string;
    }

    interface HookFallbackContributor extends RenderedHookContributor {
      readonly fallbackAgentIds: ReadonlyArray<string>;
    }

    const readManifestForRef = (ref: HookExtensionRef) =>
      ref.refType === "registry"
        ? Effect.scoped(
            sources.fetch(ref).pipe(
              Effect.mapError(coupleLifecycleDependencyFailure),
              Effect.flatMap(({ directory }) => readManifest(directory)),
            ),
          )
        : readManifest(stripFileProtocol(ref.location));

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
              rendered.command,
              rendered.manifest.timeoutMs,
            );
          }
        }
        return hooks;
      });

    const hookFallbackTarget = () =>
      Effect.gen(function* () {
        const config = yield* ws.getInstructionsConfig();
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
        return { targetPath, workspaceRelative: workspaceRelative.value };
      });

    const reconcileHookFallback = (
      target: { readonly targetPath: string; readonly workspaceRelative: string },
      input: ProjectionRenderInput<HookFallbackContributor>,
      options?: { readonly dryRun?: boolean },
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
        const { changed, observedRegion } = yield* provide(
          reconcileManagedRegionFile({
            targetPath: target.targetPath,
            displayPath: target.workspaceRelative,
            region: HOOK_FALLBACKS_REGION,
            owner: HOOK_FALLBACKS_REGION_OWNER,
            rendered,
            generation,
            ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
            unsupportedTargetDetail: `Hook fallback target does not support managed regions: ${target.workspaceRelative}`,
          }),
        );
        const fallbackAgentIds = Array.from(
          new Set(input.contributors.flatMap(({ fallbackAgentIds }) => fallbackAgentIds)),
        );
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
            path: `${target.workspaceRelative}#${HOOK_FALLBACKS_REGION}`,
            owner: HOOK_FALLBACKS_REGION_OWNER,
            present: Option.isSome(observedRegion),
            current: !changed,
            expectedContributors: input.contributors.map(({ marker }) => marker),
          } satisfies ProjectionUnitObservation,
        };
      });

    const reconcileNativeHookTarget = (args: {
      readonly target: HookWriterTarget;
      readonly input: ProjectionRenderInput<RenderedHookContributor>;
      readonly dryRun?: boolean;
    }) =>
      Effect.gen(function* () {
        const rendered = yield* renderInstalledHookGroups(args.target, args.input.contributors);
        const raw = yield* provide(readExisting(args.target.configPath));
        const observedCommands = yield* readManagedHookCommands(
          args.target.configPath,
          args.target.writer.settingsKey,
          raw,
        );
        const next = yield* updateHooksJson(
          args.target.configPath,
          args.target.writer.settingsKey,
          raw,
          rendered,
        );
        const changed = next !== raw && !(raw.trim().length === 0 && next.trim() === "{}");
        if (changed && args.dryRun !== true) {
          yield* provide(writeIfChanged(args.target.configPath, raw, next));
        }
        const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, args.target.configPath);
        if (Option.isNone(workspaceRelative)) {
          return yield* new HookConfigInvalid({
            detail: `Hook config path escapes workspace: ${args.target.configPath}`,
          });
        }
        const expectedCommands = managedHookCommands(rendered);
        return {
          unitId: "hook:agent-hook-entries",
          path: workspaceRelative.value,
          present: observedCommands.length > 0,
          current: !changed,
          expectedContributors: args.input.contributors
            .filter(({ command }) => expectedCommands.includes(command))
            .map(({ marker }) => marker),
          observedContributors: args.input.contributors
            .filter(({ command }) => observedCommands.includes(command))
            .map(({ marker }) => marker),
        } satisfies ProjectionUnitObservation;
      });

    const makeHookProjectionPlans = () =>
      Effect.gen(function* () {
        const configuredAgents = yield* ws.getConfiguredAgents();
        const targets = yield* configuredHookWriterTargets(configuredAgents, (configPath) =>
          path.resolve(baseDir, configPath),
        );
        const fallbackTarget = yield* hookFallbackTarget();
        const graph = yield* ws.getDesiredStateGraph();
        const locked = yield* ws.getLockedHooks();
        const contributors = yield* selectHookContributors({ graph, locked });
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
            ...targets.map((target) => ({
              path: path.relative(baseDir, target.configPath),
              agentIds: [target.agent.id],
            })),
            {
              path: fallbackTarget.workspaceRelative,
              ...(fallbackAgentIds.length === 0 ? {} : { agentIds: fallbackAgentIds }),
            },
          ],
        };
        const recordMaterialization = <A>(effect: Effect.Effect<A, ExtensionManagerFailure>) =>
          effect.pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                lastProjection = materialization;
              }),
            ),
          );
        const nativePlans = yield* Effect.forEach(targets, (target) =>
          planAggregateProjection({
            unitId: "hook:agent-hook-entries",
            targetFile: target.configPath,
            graph,
            select: selectNative(target.agent.id),
            adapter: {
              observe: (input) => reconcileNativeHookTarget({ target, input, dryRun: true }),
              apply: (input) =>
                recordMaterialization(reconcileNativeHookTarget({ target, input })).pipe(
                  Effect.asVoid,
                ),
            },
          }),
        );
        const fallbackPlan = yield* planAggregateProjection({
          unitId: "hook:fallback-region",
          targetFile: fallbackTarget.targetPath,
          graph,
          select: selectFallback,
          adapter: {
            observe: (input) =>
              reconcileHookFallback(fallbackTarget, input, {
                dryRun: true,
              }).pipe(Effect.map(({ projectionUnitObservation }) => projectionUnitObservation)),
            apply: (input) =>
              recordMaterialization(reconcileHookFallback(fallbackTarget, input)).pipe(
                Effect.asVoid,
              ),
          },
        });
        return [...nativePlans, fallbackPlan];
      });

    const configuredAgentOutcomes = (state: "projected" | "current") =>
      Effect.gen(function* () {
        const configuredAgents = yield* ws.getConfiguredAgents();
        const targets = yield* configuredHookWriterTargets(configuredAgents, (configPath) =>
          path.resolve(baseDir, configPath),
        );
        const fallbackTarget = yield* hookFallbackTarget();
        const graph = yield* ws.getDesiredStateGraph();
        const locked = yield* ws.getLockedHooks();
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
        const configuredAgents = yield* ws.getConfiguredAgents();
        const targets = yield* configuredHookWriterTargets(configuredAgents, (configPath) =>
          path.resolve(baseDir, configPath),
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
            },
          ],
          state,
        });
      });

    const projectionPlans = () => makeHookProjectionPlans();
    const applyHookProjections = projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));

    const materializeInstall: ExtensionManager<HookExtensionRef>["materializeInstall"] = Effect.fn(
      "HookManager.materializeInstall",
    )(function* ({ ref }) {
      const materialized = yield* materializePackage(ref);
      const packageRoot = materialized.packageRoot;
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(
              path,
              baseDir,
              ref.sourcePath ?? stripFileProtocol(ref.location),
            )
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* new HookDefinitionInvalid({
          detail: `Local hook source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const sourceHash = yield* provide(computePackageContentHash(packageRoot));
      lastInstallState.set(ref.hook.name, {
        ref,
        workspaceRelativeLocalSourcePath,
        sourceHash,
        treeIntegrity: materialized.treeIntegrity,
      });
    }, Effect.asVoid);

    const buildLockEntry = (
      ref: HookExtensionRef,
    ): Effect.Effect<Option.Option<HookLockEntry>, HookInstallStateMissing> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.hook.name);
        switch (ref.refType) {
          case "registry":
            return state === undefined
              ? yield* new HookInstallStateMissing({ name: ref.hook.name, kind: "tree-integrity" })
              : Option.some(registryHookLockEntry(ref, state.treeIntegrity));
          case "git-hosted":
            return state === undefined
              ? yield* new HookInstallStateMissing({
                  name: ref.hook.name,
                  kind: "content-identity",
                })
              : Option.some(gitHookLockEntry(ref, state.sourceHash, state.treeIntegrity));
          case "local":
            return state === undefined
              ? yield* new HookInstallStateMissing({
                  name: ref.hook.name,
                  kind: "content-identity",
                })
              : Option.some(
                  localHookLockEntry(
                    ref,
                    state.workspaceRelativeLocalSourcePath,
                    state.sourceHash,
                    state.treeIntegrity,
                  ),
                );
          case "workspace":
            return Option.none();
        }
      });

    // Canonical removal only. The shared operation flow re-renders the hook
    // units after settings and lock removal, once the target has left the graph.
    const materializeUninstall: ExtensionManager<HookExtensionRef>["materializeUninstall"] =
      Effect.fn("HookManager.materializeUninstall")(function* ({ target }) {
        const canonical = yield* provide(
          acceptedCanonicalObservation({
            workspace: ws,
            type: "hook",
            name: target.name,
          }),
        );
        const packageRoot = removableAcceptedCanonicalPath(canonical);
        if (Option.isSome(packageRoot)) {
          yield* protectWorkspacePath(packageRoot.value);
          yield* fs.remove(packageRoot.value, { recursive: true, force: true }).pipe(
            Effect.mapError(
              (error) =>
                new HookIoFailed({
                  detail: `Failed to remove hook package source: ${packageRoot.value}`,
                  cause: error,
                }),
            ),
          );
        }
      }, Effect.asVoid);
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole unit set drops this hook's entries.
    const materializeDeactivate: ExtensionManager<HookExtensionRef>["materializeDeactivate"] =
      Effect.fn("HookManager.materializeDeactivate")(() => applyHookProjections);

    return {
      type: "hook",
      runTransaction: ws.runTransaction,
      projectionPlans,
      configuredAgentOutcomes,
      configuredAgentOutcomesForRef,
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "hook", target.name).pipe(
          Effect.withSpan("HookManager.isInstalled"),
        ),

      materializeInstall,
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            workspace: ws,
            type: "hook",
            name: ref.hook.name,
            ref,
          }),
        ),
      getLastMaterialization: () => Effect.succeed(lastProjection ?? { agents: [], targets: [] }),
      getConfiguredSource: Effect.fn("HookManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredHookEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),

      /**
       * Every enabled entry's accepted canonical package, read from accepted
       * resolution rather than re-resolved from source. Materialization
       * realizes what the workspace already accepted; going back to the
       * source would put an unrelated configured entry's release age between
       * an operator and the extension they are authoring.
       */
      listMaterializable: Effect.fn("HookManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredHookEntries();
        const refs = yield* Effect.forEach(
          enabledConfiguredEntries(configured),
          ([name]) =>
            provide(
              usableAcceptedCanonicalRef({ workspace: ws, type: "hook", name }).pipe(
                Effect.map(Option.filter((ref): ref is HookExtensionRef => ref.type === "hook")),
              ),
            ),
          { concurrency: "unbounded" },
        );
        return refs.flatMap((ref) => (Option.isSome(ref) ? [ref.value] : []));
      }),

      materializeUninstall,
      materializeDeactivate,

      upsertSettingsEntry: Effect.fn("HookManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }) {
        const lockEntry = yield* buildLockEntry(ref);
        if (Option.isNone(lockEntry)) {
          yield* ws.setHookEntry(ref.hook.name, {
            source: "workspace",
            enabled: true,
          });
          return;
        }
        if (lockEntry.value.type === "registry") {
          yield* validateExactResolvedVersion(
            `hooks.${ref.hook.name}.resolvedVersion`,
            lockEntry.value.resolvedVersion,
          );
        }
        yield* ws.setHook({
          name: ref.hook.name,
          lockEntry: lockEntry.value,
          versionRange,
        });
      }),

      removeSettingsEntry: Effect.fn("HookManager.removeSettingsEntry")(function* ({ target }) {
        yield* ws.removeHookSettings(target.name);
      }),

      upsertLockfileEntry: Effect.fn("HookManager.upsertLockfileEntry")(function* ({ ref }) {
        const entry = yield* buildLockEntry(ref);
        if (Option.isNone(entry)) {
          yield* ws.removeHookLock(ref.hook.name);
          return;
        }
        if (ref.refType === "registry") {
          yield* validateExactResolvedVersion(
            `hooks.${ref.hook.name}.resolvedVersion`,
            ref.version,
          );
        }
        yield* ws.setHookLock({
          name: ref.hook.name,
          lockEntry: entry.value,
          versionRange: Option.none(),
        });
      }),

      removeLockfileEntry: Effect.fn("HookManager.removeLockfileEntry")(function* ({ target }) {
        yield* ws.removeHookLock(target.name);
      }),
    };
  }),
);
