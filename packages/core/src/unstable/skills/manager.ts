/**
 * Skill extension manager service.
 *
 * Implements ExtensionManager<SkillExtensionRef> with native/non-native
 * branching in materializeInstall and agent symlink creation for all
 * configured agents.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as ServiceMap from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { trustedRegistryVersionForRef, validateRefTrustTransition } from "../trust/index.js";
import { makeAppError } from "../app-error/index.js";
import { sourceToLockEntry } from "../sources/index.js";
import { configuredSkillsToDiskRefs } from "../extensions/materializable-from-disk.js";
import { enabledConfiguredEntries } from "../extensions/configured-entry.js";
import type { SkillExtensionRef } from "./refs.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import type { ExtensionManager, SkillExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { existsInAnyCanonicalLocation } from "./disk-check.js";
import { sanitizeName } from "../extensions/utils.js";
import type { SourceHash } from "../extensions/index.js";
import { computePackageContentHash } from "../extensions/index.js";
import {
  makeWorkspaceRelativeSourcePath,
  removeFromAllCanonicalLocations,
} from "../utils/index.js";
import { CodingAgentRepository, type AgentId } from "../agents/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { computeSkillSourceHash } from "./operations/source-hash.js";
import {
  ensureSkillAgentArtifact,
  materializeSkillCanonical,
  removeSkillAgentArtifact,
  type ProvideFs,
} from "./materialization.js";
import {
  capabilityRenderTargetForAgentId,
  materializeCapabilityTargetedBuild,
} from "../capability-targeting/index.js";
import { renderTargetAgentIdForLocation } from "./operations/install.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { usableTrustedCanonicalRef } from "../workspace/trusted-canonical-ref.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class SkillManager extends ServiceMap.Service<
  SkillManager,
  ExtensionManager<SkillExtensionRef>
>()("@agentxm/client-core/unstable/skills/manager/SkillManager") {}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Build skill lock entry from ref
const buildSkillLockEntry = (
  ref: SkillExtensionRef,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  now: DateTime.Utc,
) =>
  sourceToLockEntry({
    ref,
    now,
    sourceName: Option.none(),
    existingInstalledAt: Option.none(),
    workspaceRelativeLocalSourcePath,
  });

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const SkillManagerLive = Layer.effect(
  SkillManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // Provide FileSystem + Path to an effect that needs them
    const provide: ProvideFs = (effect) => Effect.provide(effect, fsPathLayer);
    const lastSourceHashes = new Map<string, SourceHash>();

    const materializeInstall: ExtensionManager<SkillExtensionRef>["materializeInstall"] = Effect.fn(
      "SkillManager.materializeInstall",
    )(function* ({ ref, force }) {
      const sanitized = sanitizeName(ref.skill.name);

      const lockedVersion = trustedRegistryVersionForRef(yield* ws.getTrustState(), ref);

      const skillSrcPath = yield* materializeSkillCanonical({
        ref,
        sanitizedName: sanitized,
        fs,
        pathService: path,
        baseDir,
        sources,
        provide,
        reuse: { force: force === true, lockedVersion },
      });

      const configuredAgents = yield* agentRepo
        .getMaterializationAgents()
        .pipe(Effect.provideService(WorkspaceMutations, ws));
      const resolved = yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
            Effect.provide(fsPathLayer),
            Effect.map((outcome) => ({ agent, outcome })),
          ),
        { concurrency: "unbounded" },
      );

      const misconfigured = Array.filter(
        resolved,
        ({ outcome }) => outcome._tag === "misconfigured",
      );
      if (misconfigured.length > 0) {
        return yield* makeAppError({
          code: "validation",
          detail: "One or more configured agents have invalid skills directory settings",
        });
      }

      const installTargets: Array<{ readonly agentId: AgentId; readonly dir: string }> = [];
      for (const { agent, outcome } of resolved) {
        if (outcome._tag === "supported") {
          installTargets.push({ agentId: agent.id, dir: path.normalize(outcome.dir) });
        }
      }
      const locations = new Map<
        string,
        { readonly dir: string; readonly agentIds: Array<AgentId> }
      >();
      for (const target of installTargets) {
        const existing = locations.get(target.dir);
        if (existing === undefined) {
          locations.set(target.dir, { dir: target.dir, agentIds: [target.agentId] });
        } else if (!existing.agentIds.includes(target.agentId)) {
          existing.agentIds.push(target.agentId);
        }
      }

      const builds = yield* Effect.forEach(
        [...locations.values()],
        (location) =>
          Effect.gen(function* () {
            const targetAgentId = renderTargetAgentIdForLocation(location.agentIds);
            const build = yield* provide(
              materializeCapabilityTargetedBuild({
                baseDir,
                canonicalSourcePath: skillSrcPath,
                extensionName: sanitized,
                target: capabilityRenderTargetForAgentId(targetAgentId),
              }),
            ).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to render ${ref.skill.name} for ${targetAgentId}`,
                  cause: error,
                }),
              ),
            );
            yield* ensureSkillAgentArtifact({
              canonicalSkillSrcPath: build.artifactSourcePath,
              targetDir: location.dir,
              sanitizedName: sanitized,
              pathService: path,
              baseDir,
              provide,
            });
            for (const finding of build.findings) {
              yield* Effect.logWarning(
                `[${finding.code}] ${ref.skill.name} (${targetAgentId}): ${finding.message}`,
              );
            }
            return { targetAgentId, build };
          }),
        { concurrency: "unbounded" },
      );
      for (const { targetAgentId, build } of builds) {
        if (!build.degraded) continue;
        yield* Effect.logWarning(
          `Capability targeting for ${ref.skill.name} on ${targetAgentId} used fallback output`,
        );
      }
      const sourceHash =
        ref.refType === "workspace"
          ? ref.sourceHash
          : ref.refType === "registry"
            ? yield* provide(computePackageContentHash(path.dirname(skillSrcPath)))
            : yield* provide(computeSkillSourceHash(skillSrcPath));
      lastSourceHashes.set(ref.skill.name, sourceHash);
    });

    const materializeUninstall: ExtensionManager<SkillExtensionRef>["materializeUninstall"] =
      Effect.fn("SkillManager.materializeUninstall")(function* ({ target, preserveSource }) {
        const sanitized = sanitizeName(target.name);

        const configuredAgents = yield* agentRepo
          .getMaterializationAgents()
          .pipe(Effect.provideService(WorkspaceMutations, ws));
        const resolved = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
              Effect.provide(fsPathLayer),
              Effect.map((outcome) => ({ agent, outcome })),
            ),
          { concurrency: "unbounded" },
        );

        const uninstallTargets: Array<string> = [];
        for (const { outcome } of resolved) {
          if (outcome._tag === "supported") {
            uninstallTargets.push(path.normalize(outcome.dir));
          }
        }
        const distinctDirs = Array.dedupe(uninstallTargets);

        yield* Effect.forEach(
          distinctDirs,
          (dir) =>
            removeSkillAgentArtifact({
              fs,
              pathService: path,
              targetDir: dir,
              sanitizedName: sanitized,
            }),
          { concurrency: "unbounded" },
        );

        if (preserveSource !== true) {
          yield* removeFromAllCanonicalLocations(fs, baseDir, "skills", sanitized, path);
        }
      });

    return {
      type: "skill",
      validateTrustTransition: ({ ref }) =>
        ws.getTrustState().pipe(Effect.flatMap((state) => validateRefTrustTransition(state, ref))),
      isInstalled: Effect.fn("SkillManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: SkillExtensionTarget;
      }) {
        if (yield* isObservedInstalled(ws, "skill", target.name)) {
          return true;
        }

        return yield* existsInAnyCanonicalLocation(fs, path, baseDir, target.name);
      }),

      materializeInstall,
      getConfiguredSource: Effect.fn("SkillManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredSkillEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("SkillManager.listMaterializable")(function* () {
        const configured = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));
        const workspaceRefs = yield* configuredSkillsToDiskRefs(
          { fs, path, baseDir, scope: ws.scope },
          configured,
        );
        const trustedRefs = yield* Effect.forEach(
          enabledConfiguredEntries(configured),
          ([name]) =>
            provide(
              usableTrustedCanonicalRef({ workspace: ws, type: "skill", name }).pipe(
                Effect.map(Option.filter((ref): ref is SkillExtensionRef => ref.type === "skill")),
              ),
            ),
          { concurrency: "unbounded" },
        );
        const refsByName = new Map(workspaceRefs.map((ref) => [ref.skill.name, ref]));
        for (const ref of trustedRefs) {
          if (Option.isSome(ref)) refsByName.set(ref.value.skill.name, ref.value);
        }
        return [...refsByName.values()];
      }),
      materializeUninstall,

      upsertSettingsEntry: Effect.fn("SkillManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }: {
        readonly ref: SkillExtensionRef;
        readonly versionRange: Option.Option<string>;
      }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local skill source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const now = yield* DateTime.now;
        const sourceHash = lastSourceHashes.get(ref.skill.name);
        const lockEntry = {
          ...buildSkillLockEntry(ref, workspaceRelativeLocalSourcePath, now),
          ...(sourceHash === undefined ? {} : { sourceHash }),
        };
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `skills.${ref.skill.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSkill({ name: ref.skill.name, lockEntry, versionRange });
      }),

      removeSettingsEntry: ({ target }: { readonly target: SkillExtensionTarget }) =>
        ws
          .removeSkillFromSettings(target.name)
          .pipe(Effect.withSpan("SkillManager.removeSettingsEntry")),

      upsertLockfileEntry: Effect.fn("SkillManager.upsertLockfileEntry")(function* ({
        ref,
      }: {
        readonly ref: SkillExtensionRef;
      }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local skill source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const now = yield* DateTime.now;
        const sourceHash = lastSourceHashes.get(ref.skill.name);
        const lockEntry = {
          ...buildSkillLockEntry(ref, workspaceRelativeLocalSourcePath, now),
          ...(sourceHash === undefined ? {} : { sourceHash }),
        };
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `skills.${ref.skill.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSkillLock({
          name: ref.skill.name,
          lockEntry,
          versionRange: Option.none(),
        });
      }),

      removeLockfileEntry: ({ target }: { readonly target: SkillExtensionTarget }) =>
        ws.removeSkillLock(target.name).pipe(Effect.withSpan("SkillManager.removeLockfileEntry")),
      removeTrustEntry: ({ target }: { readonly target: SkillExtensionTarget }) =>
        ws.removeTrustRecord("skill", target.name),
    } satisfies ExtensionManager<SkillExtensionRef>;
  }),
);

// -----------------------------------------------------------------------------
// Internal materialization helpers
// -----------------------------------------------------------------------------
