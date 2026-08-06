/**
 * Hook manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
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
import { computeSourceHash, type SourceHash } from "../extensions/rendered-files.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  enabledConfiguredEntries,
  markerFqnForRef,
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../extensions/index.js";
import { validatePathSafety } from "../extensions/utils.js";
import { MaterializedFileTargetSchema, validateExactResolvedVersion } from "../lockfile/index.js";
import type { HookLockEntry, MaterializedFileTarget } from "../lockfile/index.js";
import { commonLockFields, gitSourceLockFields } from "../lockfile/entry-fields.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import { runWithTransientFileBackup } from "../utils/transient-backup.js";
import {
  commentStyleForTarget,
  replaceManagedRegion,
  stripManagedRegion,
} from "../managed-files/index.js";
import { decodeRelativePathSync, makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { trustedRegistryVersionForRef, validateRefTrustTransition } from "../trust/index.js";
import { resolveConfiguredHook } from "../workspace/configured-entry-resolution/index.js";
import type { ExtensionManager, ExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { trustedCanonicalObservation } from "../workspace/trusted-canonical-ref.js";
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
  type WorkspaceHookRef,
} from "./index.js";
import { updateHooksJson } from "./managed-groups.js";

export class HookManager extends ServiceMap.Service<
  HookManager,
  ExtensionManager<HookExtensionRef>
>()("@agentxm/client-core/unstable/hooks/manager/HookManager") {}

const HOOK_FALLBACKS_REGION = "hook-fallbacks";

// Per-package in-process mutex so concurrent re-materialization of the same hook
// package (remove+copy) is serialized rather than racing.
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

const optionalSourceHash = (
  sourceHash: SourceHash | undefined,
): { readonly sourceHash?: SourceHash } => (sourceHash === undefined ? {} : { sourceHash });

const registryHookLockEntry = (
  ref: RegistryHookRef,
  now: DateTime.Utc,
  sourceHash: SourceHash | undefined,
): HookLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const gitHookLockEntry = (
  ref: GitHostedHookRef,
  now: DateTime.Utc,
  sourceHash: SourceHash | undefined,
): HookLockEntry => ({
  ...gitSourceLockFields(ref.source, ref.gitTreeSha),
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const localHookLockEntry = (
  ref: LocalHookRef,
  now: DateTime.Utc,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  sourceHash: SourceHash | undefined,
): HookLockEntry => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const workspaceHookLockEntry = (ref: WorkspaceHookRef, now: DateTime.Utc): HookLockEntry => ({
  type: "workspace",
  owner: ref.owner,
  extensionType: "hook",
  name: ref.name,
  version: ref.version,
  sourceHash: ref.sourceHash,
  ...commonLockFields(now),
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
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = ws.baseDir;

    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
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
        readonly materializedTargets: ReadonlyArray<MaterializedFileTarget>;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
        readonly sourceHash: SourceHash;
      }
    >();

    const materializeFromRegistry = (ref: RegistryHookRef) =>
      Effect.gen(function* () {
        const lockedVersion = trustedRegistryVersionForRef(yield* ws.getTrustState(), ref);
        return yield* provide(
          materializeRegistryPackage({
            baseDir,
            canonicalPath: path.join(
              baseDir,
              REGISTRY_EXTENSIONS_DIR,
              ref.owner,
              HOOK_EXTENSION_DIR,
              ref.name,
            ),
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "hook",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            messages: {
              existsFailureDetail: (canonicalPath) =>
                `Failed to check if canonical hook package path exists: ${canonicalPath}`,
              integrityMismatchCode: "network",
              integrityMismatchDetail: `Integrity mismatch for hook:${ref.name}@${ref.version}`,
              tempDirectoryFailureDetail:
                "Temporary directory for registry hook install could not be created",
              createDirectoryFailureDetail: (canonicalPath) =>
                `Failed to create registry hook directory: ${canonicalPath}`,
              inspectExtractedFailureDetail: "Failed to inspect extracted registry hook package",
              copyEntryFailureCode: "internal",
              copyEntryFailureDetail: (entry) =>
                `Failed to copy registry hook package entry: ${entry}`,
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
        yield* validatePathSafety(packageRoot, absolute);
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

    const markerForRef = (ref: HookExtensionRef, manifest: HookManifest): string =>
      markerFqnForRef({ ref, manifest, type: "hook", name: ref.hook.name });

    const renderHookRef = (args: {
      readonly ref: HookExtensionRef;
      readonly packageRoot: string;
    }) =>
      Effect.gen(function* () {
        const manifest = yield* readManifest(args.packageRoot);
        const entrypoint = yield* entrypointPath(args.packageRoot, manifest);
        const command = `${interpreterForRuntime(manifest.runtime)} ${entrypoint}`;
        return {
          name: args.ref.hook.name,
          marker: markerForRef(args.ref, manifest),
          manifest,
          command,
        };
      });

    const renderInstalledHookGroups = (
      target: HookWriterTarget,
      args?: {
        readonly include?: {
          readonly ref: HookExtensionRef;
          readonly packageRoot: string;
        };
        readonly excludeName?: string;
      },
    ) =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredHookEntries();
        const renderedHooks = yield* Effect.forEach(
          Object.entries(configured).filter(
            ([name, entry]) =>
              entry.enabled && name !== args?.excludeName && name !== args?.include?.ref.hook.name,
          ),
          ([name, entry]) =>
            Effect.scoped(provide(resolveConfiguredHook(name, entry.source))).pipe(
              Effect.flatMap(({ ref }) =>
                Effect.gen(function* () {
                  const packageRoot = yield* materializePackage(ref);
                  return yield* renderHookRef({ ref, packageRoot });
                }),
              ),
            ),
          { concurrency: "unbounded" },
        );

        const included = args?.include === undefined ? [] : [yield* renderHookRef(args.include)];
        const sorted = [...renderedHooks, ...included].sort((a, b) =>
          a.marker.localeCompare(b.marker),
        );
        const hooks: Record<string, unknown> = {};
        for (const rendered of sorted) {
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

    const renderInstalledFallbackHooks = (args?: {
      readonly include?: {
        readonly ref: HookExtensionRef;
        readonly packageRoot: string;
      };
      readonly excludeName?: string;
    }) =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredHookEntries();
        const installed = yield* Effect.forEach(
          Object.entries(configured).filter(
            ([name, entry]) =>
              entry.enabled && name !== args?.excludeName && name !== args?.include?.ref.hook.name,
          ),
          ([name, entry]) =>
            Effect.scoped(provide(resolveConfiguredHook(name, entry.source))).pipe(
              Effect.flatMap(({ ref }) =>
                Effect.gen(function* () {
                  const packageRoot = yield* materializePackage(ref);
                  return { ref, rendered: yield* renderHookRef({ ref, packageRoot }) };
                }),
              ),
            ),
          { concurrency: "unbounded" },
        );
        const included =
          args?.include === undefined
            ? []
            : [
                {
                  ref: args.include.ref,
                  rendered: yield* renderHookRef(args.include),
                },
              ];
        return [...installed, ...included].sort((left, right) =>
          left.rendered.marker.localeCompare(right.rendered.marker),
        );
      });

    const writeHookFallbackRules = (
      fallbackAgents: ReadonlyArray<CapabilityAgent>,
      args?: {
        readonly include?: {
          readonly ref: HookExtensionRef;
          readonly packageRoot: string;
        };
        readonly excludeName?: string;
      },
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

        const hooks = fallbackAgents.length === 0 ? [] : yield* renderInstalledFallbackHooks(args);
        for (const hook of hooks) {
          if ((hook.ref.fallback ?? hook.rendered.manifest.fallback) === "none") {
            return yield* makeAppError({
              code: "validation",
              detail: `Hook ${hook.rendered.name} requires native hook support because fallback is none`,
            });
          }
        }
        const rendered = hooks
          .map(
            ({ rendered: hook }) =>
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
        if (updated !== existing) {
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
        if (fallbackAgents.length > 0 && rendered.length > 0) {
          yield* Effect.logWarning(
            `Degraded hooks to advisory rules for ${fallbackAgents.map((agent) => agent.id).join(", ")}`,
          );
        }
        return decodeMaterializedTarget({
          target: decodeRelativePathSync(workspaceRelative.value),
          mode: "managed-region",
          region: HOOK_FALLBACKS_REGION,
          renderHash: computeSourceHash(rendered),
        });
      });

    const writeHooksConfig = (args?: {
      readonly include?: {
        readonly ref: HookExtensionRef;
        readonly packageRoot: string;
      };
      readonly excludeName?: string;
    }) =>
      Effect.gen(function* () {
        const configuredAgents = yield* ws.getConfiguredAgents();
        const targets = yield* configuredHookWriterTargets(configuredAgents, (configPath) =>
          path.resolve(baseDir, configPath),
        );
        const fallbackAgents = configuredHookFallbackAgents(configuredAgents);

        const renderedTargets = yield* Effect.forEach(
          targets,
          (target) =>
            Effect.gen(function* () {
              const rendered = yield* renderInstalledHookGroups(target, args);
              return { target, rendered };
            }),
          { concurrency: "unbounded" },
        );

        const nativeTargets = yield* Effect.forEach(
          renderedTargets,
          ({ target, rendered }) =>
            Effect.gen(function* () {
              const raw = yield* provide(readExisting(target.configPath));
              const next = yield* updateHooksJson(
                target.configPath,
                target.writer.settingsKey,
                raw,
                rendered,
              );
              yield* provide(writeIfChanged(target.configPath, raw, next));

              const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, target.configPath);
              if (Option.isNone(workspaceRelative)) {
                return yield* makeAppError({
                  code: "validation",
                  detail: `Hook config path escapes workspace: ${target.configPath}`,
                });
              }

              return decodeMaterializedTarget({
                target: decodeRelativePathSync(workspaceRelative.value),
                mode: "sync-always",
                renderHash: computeSourceHash(JSON.stringify(rendered)),
              });
            }),
          { concurrency: "unbounded" },
        );
        const fallbackTarget = yield* writeHookFallbackRules(fallbackAgents, args);
        return [...nativeTargets, fallbackTarget];
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

      const materializedTargets = yield* writeHooksConfig({ include: { ref, packageRoot } });
      const sourceHash = yield* provide(computePackageContentHash(packageRoot));
      lastInstallState.set(ref.hook.name, {
        ref,
        materializedTargets,
        workspaceRelativeLocalSourcePath,
        sourceHash,
      });
    }, Effect.asVoid);

    const buildLockEntry = (ref: HookExtensionRef): Effect.Effect<HookLockEntry, never> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.hook.name);
        const now = yield* DateTime.now;
        switch (ref.refType) {
          case "registry":
            return registryHookLockEntry(ref, now, state?.sourceHash);
          case "git-hosted":
            return gitHookLockEntry(ref, now, state?.sourceHash);
          case "local":
            return localHookLockEntry(
              ref,
              now,
              state?.workspaceRelativeLocalSourcePath ?? Option.none(),
              state?.sourceHash,
            );
          case "workspace":
            return workspaceHookLockEntry(ref, now);
        }
      });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<HookExtensionRef>["materializeUninstall"] =>
      Effect.fn("HookManager.materializeRemoval")(function* ({ target }) {
        const canonical = yield* provide(
          trustedCanonicalObservation({
            workspace: ws,
            type: "hook",
            name: target.name,
          }),
        );
        yield* writeHooksConfig({ excludeName: target.name });

        const packageRoot = Option.flatMap(canonical, (state) =>
          Option.fromUndefinedOr(state.observation.path),
        );
        if (!retainCanonical && Option.isSome(packageRoot)) {
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
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    return {
      type: "hook",
      runTransaction: ws.runTransaction,
      validateTrustTransition: (args) =>
        ws
          .getTrustState()
          .pipe(Effect.flatMap((state) => validateRefTrustTransition(state, args.ref, args))),
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "hook", target.name).pipe(
          Effect.withSpan("HookManager.isInstalled"),
        ),

      materializeInstall,
      getLastMaterialization: ({ target }) =>
        Effect.succeed({
          agents: [],
          targets: (lastInstallState.get(target.name)?.materializedTargets ?? []).map(
            (materializedTarget) => ({ path: materializedTarget.target }),
          ),
        }),
      getConfiguredSource: Effect.fn("HookManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredHookEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),

      listMaterializable: Effect.fn("HookManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredHookEntries();
        const refs = yield* Effect.scoped(
          Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) =>
              provide(resolveConfiguredHook(name, entry.source)).pipe(Effect.map(({ ref }) => ref)),
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
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `hooks.${ref.hook.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        yield* ws.setHook({
          name: ref.hook.name,
          lockEntry,
          versionRange,
          commit: "authoritative",
        });
      }),

      upsertTrustEntry: Effect.fn("HookManager.upsertTrustEntry")(function* ({ ref }) {
        const entry = yield* buildLockEntry(ref);
        yield* ws.setHookLock({
          name: ref.hook.name,
          lockEntry: entry,
          versionRange: Option.none(),
          commit: "authoritative",
        });
      }),

      removeSettingsEntry: Effect.fn("HookManager.removeSettingsEntry")(function* ({ target }) {
        yield* ws.removeHookSettings(target.name);
      }),

      upsertLockfileEntry: Effect.fn("HookManager.upsertLockfileEntry")(function* ({ ref }) {
        const entry = yield* buildLockEntry(ref);
        if (ref.refType === "registry") {
          yield* validateExactResolvedVersion(
            `hooks.${ref.hook.name}.resolvedVersion`,
            ref.version,
          );
        }
        yield* ws.setHookLock({
          name: ref.hook.name,
          lockEntry: entry,
          versionRange: Option.none(),
          commit: "receipt",
        });
      }),

      removeLockfileEntry: Effect.fn("HookManager.removeLockfileEntry")(function* ({ target }) {
        yield* ws.removeHookLock(target.name);
      }),
      removeTrustEntry: ({ target }) => ws.removeTrustRecord("hook", target.name),
    };
  }),
);
