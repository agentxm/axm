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
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { printSourceParams, sourceToLockEntry } from "../sources/index.js";
import { configuredSkillsToDiskRefs } from "../extensions/materializable-from-disk.js";
import { enabledConfiguredEntries } from "../extensions/configured-entry.js";
import type { SkillExtensionRef } from "./refs.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  MaterializationObservation,
  SkillExtensionTarget,
} from "../workspace/service-interface.js";
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
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { computeSkillSourceHash } from "./operations/source-hash.js";
import {
  ensureSkillAgentArtifact,
  materializeSkillCanonical,
  removeSkillAgentArtifact,
  type ProvideRegistryMaterialization,
} from "./materialization.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { usableAcceptedCanonicalRef } from "../workspace/accepted-canonical-ref.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { applyProjectionPlans, planSingletonProjection } from "../projection/planning.js";

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
  contentIdentity: SourceHash,
) =>
  sourceToLockEntry({
    ref,
    sourceName: Option.none(),
    contentIdentity,
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
    const httpClient = yield* HttpClient.HttpClient;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const registryMaterializationLayer = Layer.merge(
      fsPathLayer,
      Layer.succeed(HttpClient.HttpClient, httpClient),
    );

    // Provide FileSystem + Path to an effect that needs them
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);
    const provideRegistry: ProvideRegistryMaterialization = (effect) =>
      Effect.provide(effect, registryMaterializationLayer);
    const lastSourceHashes = new Map<string, SourceHash>();
    const lastMaterializations = new Map<string, MaterializationObservation>();

    const materializeInstall: ExtensionManager<SkillExtensionRef>["materializeInstall"] = Effect.fn(
      "SkillManager.materializeInstall",
    )(function* ({ ref, force }) {
      const sanitized = sanitizeName(ref.skill.name);

      const lockedVersion =
        ref.refType === "registry"
          ? acceptedRegistryVersionForRef(yield* ws.getLockedSkill(ref.skill.name), ref)
          : undefined;

      const skillSrcPath = yield* materializeSkillCanonical({
        ref,
        sanitizedName: sanitized,
        fs,
        pathService: path,
        baseDir,
        sources,
        provide,
        provideRegistry,
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

      yield* applyProjectionPlans(
        [...locations.values()].map((location) => {
          const targetFile = path.join(location.dir, sanitized);
          return planSingletonProjection({
            unitId: "skill:agent-skill-directory",
            targetFile,
            contributor: ref,
            adapter: {
              observe: () =>
                Effect.succeed({
                  unitId: "skill:agent-skill-directory",
                  path: path.relative(baseDir, targetFile),
                  present: false,
                  current: false,
                  expectedContributors: [ref.skill.name],
                  observedContributors: [],
                }),
              apply: () =>
                ensureSkillAgentArtifact({
                  canonicalSkillSrcPath: skillSrcPath,
                  targetDir: location.dir,
                  sanitizedName: sanitized,
                  pathService: path,
                  baseDir,
                  provide,
                }),
            },
          });
        }),
      );
      const sourceHash =
        ref.refType === "workspace"
          ? ref.sourceHash
          : ref.refType === "registry"
            ? yield* provide(computePackageContentHash(path.dirname(skillSrcPath)))
            : yield* provide(computeSkillSourceHash(skillSrcPath));
      lastSourceHashes.set(ref.skill.name, sourceHash);
      lastMaterializations.set(ref.skill.name, {
        agents: Array.dedupe(
          installTargets
            .map((target) => target.agentId)
            .filter((agentId) => agentId !== "universal"),
        ),
        targets: [...locations.values()].map((location) => {
          const agentIds = location.agentIds.filter((agentId) => agentId !== "universal");
          return {
            path: path.relative(baseDir, path.join(location.dir, sanitized)),
            ...(agentIds.length === 0 ? {} : { agentIds }),
          };
        }),
      });
    });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<SkillExtensionRef>["materializeUninstall"] =>
      Effect.fn("SkillManager.materializeRemoval")(function* ({ target }) {
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

        yield* applyProjectionPlans(
          distinctDirs.map((dir) => {
            const targetFile = path.join(dir, sanitized);
            return planSingletonProjection({
              unitId: "skill:agent-skill-directory",
              targetFile,
              contributor: target,
              adapter: {
                observe: () =>
                  Effect.succeed({
                    unitId: "skill:agent-skill-directory",
                    path: path.relative(baseDir, targetFile),
                    present: true,
                    current: false,
                    expectedContributors: [],
                    observedContributors: [target.name],
                  }),
                apply: () =>
                  removeSkillAgentArtifact({
                    fs,
                    pathService: path,
                    targetDir: dir,
                    sanitizedName: sanitized,
                  }),
              },
            });
          }),
        );

        if (!retainCanonical) {
          yield* removeFromAllCanonicalLocations(fs, baseDir, "skills", sanitized, path);
        }
      });
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    return {
      type: "skill",
      runTransaction: ws.runTransaction,
      isInstalled: Effect.fn("SkillManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        if (yield* isObservedInstalled(ws, "skill", target.name)) {
          return true;
        }

        return yield* existsInAnyCanonicalLocation(fs, path, baseDir, target.name);
      }),

      materializeInstall,
      getLastMaterialization: ({ target }) =>
        Effect.succeed(
          lastMaterializations.get(target.name) ?? {
            agents: [],
            targets: [],
          },
        ),
      getConfiguredSource: Effect.fn("SkillManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredSkillEntries();
        const entry = configured[target.name];
        if (entry?.origin === "bundled") {
          return Option.some(`bundled:@agentxm/skills/${target.name}`);
        }
        return Option.fromUndefinedOr(entry?.source);
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
              usableAcceptedCanonicalRef({ workspace: ws, type: "skill", name }).pipe(
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
      materializeDeactivate,

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
        const sourceHash = lastSourceHashes.get(ref.skill.name);
        if (ref.refType === "workspace") {
          return yield* ws.setSkillEntry(ref.skill.name, {
            source: printSourceParams(ref.source),
            enabled: true,
          });
        }
        if (sourceHash === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Skill ${ref.skill.name} has no materialized content identity`,
          });
        }
        const lockEntry = buildSkillLockEntry(ref, workspaceRelativeLocalSourcePath, sourceHash);
        if (lockEntry === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Skill ${ref.skill.name} did not produce an external resolution`,
          });
        }
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `skills.${ref.skill.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return yield* ws.setSkill({
          name: ref.skill.name,
          lockEntry,
          versionRange,
        });
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
        if (ref.refType === "workspace") {
          yield* ws.removeSkillLock(ref.skill.name);
          return;
        }
        const sourceHash = lastSourceHashes.get(ref.skill.name);
        if (sourceHash === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Skill ${ref.skill.name} has no materialized content identity`,
          });
        }
        const lockEntry = buildSkillLockEntry(ref, workspaceRelativeLocalSourcePath, sourceHash);
        if (lockEntry === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Skill ${ref.skill.name} did not produce an external resolution`,
          });
        }
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
    } satisfies ExtensionManager<SkillExtensionRef>;
  }),
);

// -----------------------------------------------------------------------------
// Internal materialization helpers
// -----------------------------------------------------------------------------
