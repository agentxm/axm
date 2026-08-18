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
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import { makeAppError, type AppError } from "../app-error/index.js";
import { resolveInstructionsConfig } from "../agents/instructions.js";
import {
  AGENTS as CAPABILITY_AGENTS,
  type Agent as CapabilityAgent,
  type CanonicalHookEventId,
  type CanonicalHookToolId,
  type HookEventMapping,
  type HooksWriter,
  installable,
} from "../agent-capabilities/index.js";
import { computePackageContentHash } from "../extensions/package-hash.js";
import { type SourceHash } from "../extensions/rendered-files.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  decodeExtensionNameSync,
  enabledConfiguredEntries,
  formatFqn,
  materializeExternalPackage,
  canReuseInstalledPackage,
  materializeRegistryPackage,
  registryCanonicalMaterializationIdentity,
} from "../extensions/index.js";
import { activeContributors } from "../projection/contributors.js";
import type { ProjectionUnitObservation } from "../projection/invariant-facts.js";
import { validatePathSafety } from "../extensions/utils.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import type { HookLockEntry } from "../lockfile/index.js";
import { MaterializedFileTargetSchema } from "../workspace/materialized-file-target.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import { printSourceParams } from "../sources/index.js";
import { runWithTransientFileBackup } from "../utils/transient-backup.js";
import {
  commentStyleForTarget,
  managedRegionContent,
  replaceManagedRegion,
  stripManagedRegion,
} from "../managed-files/index.js";
import { decodeRelativePathSync, makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
} from "../workspace/configured-entry-resolution/index.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  MaterializationObservation,
} from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { acceptedCanonicalObservation } from "../workspace/accepted-canonical-ref.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type GitHostedHookRef,
  type HookBinding,
  type HookExtensionRef,
  type HookManifest,
  type LocalHookRef,
  type RegistryHookRef,
} from "./index.js";
import { managedHookCommands, readManagedHookCommands, updateHooksJson } from "./managed-groups.js";

export interface HookManagerService extends ExtensionManager<HookExtensionRef> {
  readonly projectionUnitObservations: Effect.Effect<
    ReadonlyArray<ProjectionUnitObservation>,
    AppError
  >;
  readonly reconcileProjections: () => Effect.Effect<void, AppError>;
  /** Strict reconcile for sync: fails instead of deferring when a contributor is unreadable. */
  readonly reconcileHooksProjections: Effect.Effect<void, AppError>;
}

export class HookManager extends ServiceMap.Service<HookManager, HookManagerService>()(
  "@agentxm/client-core/unstable/hooks/manager/HookManager",
) {}

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

const registryHookLockEntry = (ref: RegistryHookRef): HookLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
});

const gitHookLockEntry = (ref: GitHostedHookRef, contentIdentity: SourceHash): HookLockEntry => ({
  ...gitSourceLockFields(ref.source, ref.gitCommitSha, ref.gitTreeSha, contentIdentity),
});

const localHookLockEntry = (
  ref: LocalHookRef,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  contentIdentity: SourceHash,
): HookLockEntry => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  contentIdentity,
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
): Effect.Effect<ReadonlyArray<HookWriterTarget>, AppError> =>
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
        return yield* makeAppError({
          code: "validation",
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

const configuredHookFallbackAgents = (
  configuredAgents: ReadonlyArray<string>,
): ReadonlyArray<CapabilityAgent> =>
  configuredAgents.flatMap((id) => {
    const agent = capabilityAgentById(id);
    const hook = agent?.capabilities.hook;
    return agent !== undefined &&
      hook !== undefined &&
      (hook.native.availability.via === "none" || hook.axm.writer === null)
      ? [agent]
      : [];
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

const readExisting = (configPath: string): Effect.Effect<string, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect Claude Code hooks config: ${configPath}`,
          cause: error,
        }),
      ),
    );
    if (!exists) return "";
    return yield* fs.readFileString(configPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
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
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (oldRaw === newRaw) return;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* protectWorkspacePath(configPath);
    yield* fs.makeDirectory(path.dirname(configPath), { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
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
      operation: fs.writeFileString(configPath, newRaw).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
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
): Effect.Effect<string | undefined, AppError> => {
  const noMatcher: string | undefined = undefined;
  const raw = targetMatcherRaw(agent, binding);
  if (raw !== undefined) return Effect.succeed(serializeMatcher(writer, raw));

  const tools = binding.match?.tools ?? [];
  if (tools.length === 0) return Effect.succeed(noMatcher);

  const nativeNames = tools.flatMap((tool) => hookNativeToolNames(agent, tool));
  if (nativeNames.length === 0) {
    return Effect.fail(
      makeAppError({
        code: "validation",
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
  command: string,
  timeoutMs: number | undefined,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const verdict = installable(agent, binding);
    if (!verdict.installable) {
      return yield* makeAppError({
        code: "validation",
        detail: verdict.reason,
      });
    }

    const nativeEventName = targetNativeEventName(agent, binding.on);
    if (nativeEventName === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `${agent.name} does not support ${binding.on}.`,
      });
    }

    const existingGroups = hooks[nativeEventName];
    const groups = Array.isArray(existingGroups) ? [...existingGroups] : [];
    const commandEntry: Record<string, unknown> = {
      type: "command",
      command,
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
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const lastInstallState = new Map<
      string,
      {
        readonly ref: HookExtensionRef;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
        readonly sourceHash: SourceHash;
      }
    >();
    let lastProjection: MaterializationObservation | undefined;

    const materializeFromRegistry = (ref: RegistryHookRef) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          ref.owner,
          HOOK_EXTENSION_DIR,
          ref.name,
        );
        const lockedVersion = acceptedRegistryVersionForRef(
          yield* ws.getLockedHookEntry(ref.hook.name),
          ref,
        );
        const identity = registryCanonicalMaterializationIdentity({
          owner: ref.owner,
          type: "hook",
          name: ref.name,
          version: ref.version,
          publisherBindingId: ref.publisherBindingId,
          integrity: ref.integrity,
        });
        const reuse = yield* provide(
          canReuseInstalledPackage({
            installedPath: canonicalPath,
            force: false,
            identity,
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) =>
              `Failed to check if canonical hook package path exists: ${target}`,
          }),
        );
        if (reuse) return canonicalPath;
        return yield* provide(
          materializeRegistryPackage({
            baseDir,
            destinationPath: canonicalPath,
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "hook",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            publisherBindingId: ref.publisherBindingId,
            messages: {
              integrityMismatchCode: "network",
              integrityMismatchDetail: `Integrity mismatch for hook:${ref.name}@${ref.version}`,
            },
          }),
        );
      });

    const materializeFromExternal = (ref: GitHostedHookRef | LocalHookRef) =>
      provide(
        materializeExternalPackage({
          baseDir,
          canonicalPath: path.join(
            baseDir,
            EXTERNAL_EXTENSIONS_DIR,
            HOOK_EXTENSION_DIR,
            ref.hook.name,
          ),
          sourceLocation: ref.location,
          copyFailureCode: "validation",
          copyFailureDetail: (canonicalPath) =>
            `Failed to copy hook package files to ${canonicalPath}`,
        }),
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
            const expectedPath = path.join(
              baseDir,
              REGISTRY_EXTENSIONS_DIR,
              ref.owner,
              HOOK_EXTENSION_DIR,
              ref.name,
            );
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* makeAppError({
                code: "validation",
                detail: `Invalid workspace hook source location: ${ref.location}`,
              });
            }
            return ref.location;
          }
        }
      });

    const readManifest = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, HOOK_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              makeAppError({
                code: "validation",
                detail: `Failed to parse ${HOOK_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeHookManifest(content)),
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
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
          return yield* makeAppError({
            code: "validation",
            detail: `Hook entrypoint does not exist: ${manifest.entrypoint}`,
          });
        }
        const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, absolute);
        if (Option.isNone(workspaceRelative)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Hook entrypoint escapes workspace: ${manifest.entrypoint}`,
          });
        }
        return workspaceRelative.value;
      });

    // Both hook ownership units are aggregates: the AXM-owned entries in one
    // agent's hook configuration and the fallback region each carry every
    // enabled Hook the complete desired-state graph reaches, whether declared
    // directly or contributed by a Pack. Membership never comes from settings
    // entries, and content is read from accepted canonical packages.
    // With `onUnready: "skip"` a contributor whose accepted resolution or
    // canonical content is not yet readable yields Option.none: a lifecycle
    // step installing several contributors defers the unit writes until the
    // closure's final reconcile can render the complete set. An incomplete
    // desired-state graph always fails; skipping never drops a contributor
    // from a rendered set.
    const renderedHookContributors = (args?: { readonly onUnready?: "fail" | "skip" }) =>
      Effect.gen(function* () {
        const resolved = yield* Effect.result(
          Effect.gen(function* () {
            const graph = yield* ws.getDesiredStateGraph();
            const locked = yield* ws.getLockedHooks();
            const contributors = yield* activeContributors({
              baseDir,
              path,
              type: "hook",
              extensionDir: HOOK_EXTENSION_DIR,
              graph,
              locked,
            });
            return yield* Effect.forEach(
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
            );
          }),
        );
        if (Result.isFailure(resolved)) {
          if (args?.onUnready === "skip") {
            return Option.none<ReadonlyArray<RenderedHookContributor>>();
          }
          return yield* resolved.failure;
        }
        return Option.some([...resolved.success].sort((a, b) => a.marker.localeCompare(b.marker)));
      });

    interface RenderedHookContributor {
      readonly name: string;
      readonly marker: string;
      readonly manifest: HookManifest;
      readonly command: string;
    }

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
              rendered.command,
              rendered.manifest.timeoutMs,
            );
          }
        }
        return hooks;
      });

    const writeHookFallbackRules = (
      fallbackAgents: ReadonlyArray<CapabilityAgent>,
      contributors: ReadonlyArray<RenderedHookContributor>,
      options?: { readonly dryRun?: boolean },
    ) =>
      Effect.gen(function* () {
        const config = yield* ws.getInstructionsConfig();
        const resolved = resolveInstructionsConfig(
          Option.isSome(config) && config.value !== false ? config.value : undefined,
        );
        const targetPath = path.resolve(baseDir, resolved.fileName);
        const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, targetPath);
        if (Option.isNone(workspaceRelative)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Hook fallback instruction source escapes workspace: ${resolved.fileName}`,
          });
        }
        const style = commentStyleForTarget(workspaceRelative.value);
        if (Option.isNone(style)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Hook fallback target does not support managed regions: ${resolved.fileName}`,
          });
        }

        const hooks = fallbackAgents.length === 0 ? [] : contributors;
        for (const hook of hooks) {
          if (hook.manifest.fallback === "none") {
            return yield* makeAppError({
              code: "validation",
              detail: `Hook ${hook.name} requires native hook support because fallback is none`,
            });
          }
        }
        const rendered = hooks
          .map(
            (hook) =>
              `### ${hook.manifest.title ?? hook.name}\n\nFor agents without native hook support (${fallbackAgents.map((agent) => agent.id).join(", ")}), treat this as a managed advisory rule. After the matching lifecycle event (${hook.manifest.bindings.map((binding) => binding.on).join(", ")}), run \`${hook.command}\` and address any findings before continuing.`,
          )
          .join("\n\n");
        const exists = yield* fs.exists(targetPath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: `Failed to inspect hook fallback target: ${targetPath}`,
              cause,
            }),
          ),
        );
        const existing = exists
          ? yield* fs.readFileString(targetPath).pipe(
              Effect.mapError((cause) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to read hook fallback target: ${targetPath}`,
                  cause,
                }),
              ),
            )
          : "";
        const updated =
          rendered.length === 0
            ? stripManagedRegion(existing, { region: HOOK_FALLBACKS_REGION }, style.value)
            : replaceManagedRegion({
                content: existing,
                marker: { region: HOOK_FALLBACKS_REGION },
                rendered,
                style: style.value,
              });
        const changed = updated !== existing;
        const observedRegion = managedRegionContent(
          existing,
          { region: HOOK_FALLBACKS_REGION },
          style.value,
        );
        if (changed && options?.dryRun !== true) {
          yield* protectWorkspacePath(targetPath);
          yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true }).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "internal",
                detail: `Failed to create hook fallback target directory: ${path.dirname(targetPath)}`,
                cause,
              }),
            ),
          );
          yield* fs.writeFileString(targetPath, updated).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "internal",
                detail: `Failed to write hook fallback target: ${targetPath}`,
                cause,
              }),
            ),
          );
        }
        if (options?.dryRun !== true && fallbackAgents.length > 0 && rendered.length > 0) {
          yield* Effect.logWarning(
            `Degraded hooks to advisory rules for ${fallbackAgents.map((agent) => agent.id).join(", ")}`,
          );
        }
        return {
          changed,
          materializedTarget: decodeMaterializedTarget({
            target: decodeRelativePathSync(workspaceRelative.value),
            mode: "managed-region",
            region: HOOK_FALLBACKS_REGION,
          }),
          projectionUnitObservation: {
            unitId: "hook:fallback-region",
            path: `${workspaceRelative.value}#${HOOK_FALLBACKS_REGION}`,
            present: Option.isSome(observedRegion),
            current: !changed,
            expectedContributors: hooks.map(({ marker }) => marker),
            observedContributors: Option.match(observedRegion, {
              onNone: () => [],
              onSome: (region) =>
                hooks.filter(({ command }) => region.includes(command)).map(({ marker }) => marker),
            }),
          } satisfies ProjectionUnitObservation,
        };
      });

    const writeHooksConfig = (args?: {
      readonly dryRun?: boolean;
      readonly onUnready?: "fail" | "skip";
    }) =>
      Effect.gen(function* () {
        const configuredAgents = yield* ws.getConfiguredAgents();
        const targets = yield* configuredHookWriterTargets(configuredAgents, (configPath) =>
          path.resolve(baseDir, configPath),
        );
        const fallbackAgents = configuredHookFallbackAgents(configuredAgents);
        const contributorsOption = yield* renderedHookContributors(args);
        if (Option.isNone(contributorsOption)) {
          // A contributor is not renderable yet; a later step in the same
          // closure completes the writes, and lint and sync detect the units
          // if convergence never happens.
          return {
            changed: false,
            materializedTargets: [],
            materialization: { agents: [], targets: [] },
            projectionUnitObservations: [],
          };
        }
        const contributors = contributorsOption.value;

        const renderedTargets = yield* Effect.forEach(
          targets,
          (target) =>
            Effect.gen(function* () {
              const rendered = yield* renderInstalledHookGroups(target, contributors);
              return { target, rendered };
            }),
          { concurrency: "unbounded" },
        );

        const nativeTargets = yield* Effect.forEach(
          renderedTargets,
          ({ target, rendered }) =>
            Effect.gen(function* () {
              const raw = yield* provide(readExisting(target.configPath));
              const observedCommands = yield* readManagedHookCommands(
                target.configPath,
                target.writer.settingsKey,
                raw,
              );
              const next = yield* updateHooksJson(
                target.configPath,
                target.writer.settingsKey,
                raw,
                rendered,
              );
              // An absent or empty config with nothing to render stays absent;
              // normalization alone is not a required change.
              const changed = next !== raw && !(raw.trim().length === 0 && next.trim() === "{}");
              if (changed && args?.dryRun !== true) {
                yield* provide(writeIfChanged(target.configPath, raw, next));
              }

              const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, target.configPath);
              if (Option.isNone(workspaceRelative)) {
                return yield* makeAppError({
                  code: "validation",
                  detail: `Hook config path escapes workspace: ${target.configPath}`,
                });
              }

              const expectedCommands = managedHookCommands(rendered);

              return {
                agentId: target.agent.id,
                changed,
                materializedTarget: decodeMaterializedTarget({
                  target: decodeRelativePathSync(workspaceRelative.value),
                  mode: "sync-always",
                }),
                projectionUnitObservation: {
                  unitId: "hook:agent-hook-entries",
                  path: workspaceRelative.value,
                  present: observedCommands.length > 0,
                  current: !changed,
                  expectedContributors: contributors
                    .filter(({ command }) => expectedCommands.includes(command))
                    .map(({ marker }) => marker),
                  observedContributors: contributors
                    .filter(({ command }) => observedCommands.includes(command))
                    .map(({ marker }) => marker),
                } satisfies ProjectionUnitObservation,
              };
            }),
          { concurrency: "unbounded" },
        );
        const fallback = yield* writeHookFallbackRules(fallbackAgents, contributors, args);
        const fallbackTarget = fallback.materializedTarget;
        const agentsByTarget = new Map<string, Array<string>>();
        for (const { agentId, materializedTarget } of nativeTargets) {
          const agents = agentsByTarget.get(materializedTarget.target) ?? [];
          if (!agents.includes(agentId)) agents.push(agentId);
          agentsByTarget.set(materializedTarget.target, agents);
        }
        if (fallbackAgents.length > 0) {
          agentsByTarget.set(
            fallbackTarget.target,
            fallbackAgents.map(({ id }) => id),
          );
        }
        const materializedTargets = [
          ...nativeTargets.map(({ materializedTarget }) => materializedTarget),
          fallbackTarget,
        ];
        const result = {
          changed: fallback.changed || nativeTargets.some(({ changed }) => changed),
          materializedTargets,
          materialization: {
            agents: configuredAgents.filter((agentId) =>
              Array.from(agentsByTarget.values()).some((agents) => agents.includes(agentId)),
            ),
            targets: materializedTargets
              .filter(
                (target, index, all) =>
                  all.findIndex((candidate) => candidate.target === target.target) === index,
              )
              .map((target) => {
                const agentIds = agentsByTarget.get(target.target) ?? [];
                return {
                  path: target.target,
                  ...(agentIds.length === 0 ? {} : { agentIds }),
                };
              }),
          },
          projectionUnitObservations: [
            ...nativeTargets.map(({ projectionUnitObservation }) => projectionUnitObservation),
            fallback.projectionUnitObservation,
          ],
        };
        if (args?.dryRun !== true) {
          lastProjection = result.materialization;
        }
        return result;
      });

    const materializeInstall: ExtensionManager<HookExtensionRef>["materializeInstall"] = Effect.fn(
      "HookManager.materializeInstall",
    )(function* ({ ref }) {
      const packageRoot = yield* materializePackage(ref);
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* makeAppError({
          code: "validation",
          detail: `Local hook source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const sourceHash = yield* provide(computePackageContentHash(packageRoot));
      lastInstallState.set(ref.hook.name, {
        ref,
        workspaceRelativeLocalSourcePath,
        sourceHash,
      });
    }, Effect.asVoid);

    const buildLockEntry = (
      ref: HookExtensionRef,
    ): Effect.Effect<Option.Option<HookLockEntry>, AppError> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.hook.name);
        switch (ref.refType) {
          case "registry":
            return Option.some(registryHookLockEntry(ref));
          case "git-hosted":
            return state === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Hook ${ref.hook.name} has no materialized content identity`,
                })
              : Option.some(gitHookLockEntry(ref, state.sourceHash));
          case "local":
            return state === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Hook ${ref.hook.name} has no materialized content identity`,
                })
              : Option.some(
                  localHookLockEntry(ref, state.workspaceRelativeLocalSourcePath, state.sourceHash),
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
        const packageRoot = Option.flatMap(canonical, (state) =>
          Option.fromUndefinedOr(state.observation.path),
        );
        if (Option.isSome(packageRoot)) {
          yield* protectWorkspacePath(packageRoot.value);
          yield* fs.remove(packageRoot.value, { recursive: true, force: true }).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
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
      Effect.fn("HookManager.materializeDeactivate")(
        () => writeHooksConfig({ onUnready: "skip" }),
        Effect.asVoid,
      );

    return {
      type: "hook",
      runTransaction: ws.runTransaction,
      reconcileProjections: () => writeHooksConfig({ onUnready: "skip" }).pipe(Effect.asVoid),
      reconcileHooksProjections: writeHooksConfig().pipe(Effect.asVoid),
      projectionUnitObservations: writeHooksConfig({ dryRun: true }).pipe(
        Effect.map(({ projectionUnitObservations }) => projectionUnitObservations),
      ),
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "hook", target.name).pipe(
          Effect.withSpan("HookManager.isInstalled"),
        ),

      materializeInstall,
      getLastMaterialization: () => Effect.succeed(lastProjection ?? { agents: [], targets: [] }),
      getConfiguredSource: Effect.fn("HookManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredHookEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),

      listMaterializable: Effect.fn("HookManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredHookEntries();
        const releaseAgeEvaluation = yield* provide(makeConfiguredReleaseAgeEvaluation("enforce"));
        const refs = yield* Effect.scoped(
          Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) =>
              provide(resolveConfiguredHook(name, entry.source, releaseAgeEvaluation)).pipe(
                Effect.map(({ ref }) => ref),
              ),
            { concurrency: "unbounded" },
          ),
        );
        return refs;
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
            source: printSourceParams(ref.source),
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
