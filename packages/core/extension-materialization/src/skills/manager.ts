import { usableAcceptedCanonical } from "@agentxm/workspace-state";
import { LifecyclePostconditionViolated } from "../extensions/errors.js";
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
import { stripFileProtocol } from "@agentxm/registry-client";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { sourceToLockEntry } from "@agentxm/workspace-state";
import { configuredSkillsToDiskRefs } from "../extensions/materializable-from-disk.js";
import { enabledConfiguredEntries } from "@agentxm/workspace-state";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { ExtensionManager, ManagerRequirements } from "../manager-contract.js";
import type { SkillMaterializationFacts } from "../managers.js";
import type { ExtensionTarget } from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { sanitizeName } from "@agentxm/workspace-state";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import { computePackageContentHash } from "@agentxm/workspace-state";
import type { TreeIntegrity } from "@agentxm/workspace-state";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { removeIfExists } from "@agentxm/workspace-state";
import { SkillManager } from "../managers.js";
import { SkillDefinitionInvalid, SkillInstallStateMissing } from "./errors.js";
import {
  CodingAgentRepository,
  applyProjectionPlans,
  planSingletonProjection,
} from "@agentxm/workspace-projection";
import { type AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "@agentxm/workspace-state";
import { computeSkillSourceHash } from "./source-hash.js";
import {
  ensureSkillAgentArtifact,
  materializeSkillCanonical,
  removeSkillAgentArtifact,
} from "./materialization.js";
import { configuredRowsByName } from "@agentxm/workspace-state";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
  usableAcceptedCanonicalRef,
} from "@agentxm/workspace-state";
import { isObservedInstalled } from "@agentxm/workspace-state";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Build skill lock entry from ref
const buildSkillLockEntry = (
  ref: SkillExtensionRef,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
) =>
  sourceToLockEntry({
    ref,
    sourceName: Option.none(),
    contentIdentity,
    treeIntegrity,
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
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = ws.baseDir;

    const materializeInstall: ExtensionManager<
      SkillExtensionRef,
      SkillMaterializationFacts,
      ManagerRequirements
    >["materializeInstall"] = Effect.fn("SkillManager.materializeInstall")(function* ({
      ref,
      force,
    }) {
      const sanitized = sanitizeName(ref.skill.name);

      const lockedEntry = yield* ws.getLockedSkill(ref.skill.name);
      const lockedVersion =
        ref.refType === "registry" ? acceptedRegistryVersionForRef(lockedEntry, ref) : undefined;

      const materialized = yield* materializeSkillCanonical({
        ref,
        sanitizedName: sanitized,
        baseDir,
        layout: ws.layout,
        reuse: {
          force: force === true,
          lockedVersion,
          lockedTreeIntegrity: Option.isSome(lockedEntry)
            ? lockedEntry.value.treeIntegrity
            : undefined,
        },
      });
      const skillSrcPath = materialized.skillSrcPath;

      const configuredAgents = yield* agentRepo
        .getMaterializationAgents()
        .pipe(Effect.provideService(WorkspaceMutations, ws));
      const resolved = yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .resolveEffectiveSkillsDir({ workspaceRoot: baseDir })
            .pipe(Effect.map((outcome) => ({ agent, outcome }))),
        { concurrency: "unbounded" },
      );

      const misconfigured = Array.filter(
        resolved,
        ({ outcome }) => outcome._tag === "misconfigured",
      );
      if (misconfigured.length > 0) {
        return yield* new SkillDefinitionInvalid({
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
                  baseDir,
                }),
            },
          });
        }),
      );
      const sourceHash =
        ref.refType === "workspace"
          ? ref.sourceHash
          : ref.refType === "registry"
            ? yield* computePackageContentHash(path.dirname(skillSrcPath))
            : yield* computeSkillSourceHash(skillSrcPath);
      if (ref.refType !== "workspace" && materialized.treeIntegrity === undefined) {
        return yield* new SkillInstallStateMissing({
          name: ref.skill.name,
          kind: "tree-integrity",
        });
      }
      return {
        sourceHash: Option.some(sourceHash),
        treeIntegrity: Option.fromUndefinedOr(
          ref.refType === "workspace" ? undefined : materialized.treeIntegrity,
        ),
        observation: {
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
        },
      } satisfies SkillMaterializationFacts;
    });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<
      SkillExtensionRef,
      SkillMaterializationFacts,
      ManagerRequirements
    >["materializeUninstall"] =>
      Effect.fn("SkillManager.materializeRemoval")(function* ({ target }) {
        const sanitized = sanitizeName(target.name);

        const configuredAgents = yield* agentRepo
          .getMaterializationAgents()
          .pipe(Effect.provideService(WorkspaceMutations, ws));
        const resolved = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent
              .resolveEffectiveSkillsDir({ workspaceRoot: baseDir })
              .pipe(Effect.map((outcome) => ({ agent, outcome }))),
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
                    targetDir: dir,
                    sanitizedName: sanitized,
                  }),
              },
            });
          }),
        );

        if (!retainCanonical) {
          const canonical = yield* acceptedCanonicalObservation({
            workspace: ws,
            type: "skill",
            name: target.name,
          });
          const packageRoot = removableAcceptedCanonicalPath(canonical);
          if (Option.isSome(packageRoot)) yield* removeIfExists(fs, packageRoot.value);
        }
        return {
          sourceHash: Option.none(),
          treeIntegrity: Option.none(),
          observation: {
            agents: [],
            targets: distinctDirs.map((dir) => ({
              path: path.relative(baseDir, path.join(dir, sanitized)),
            })),
          },
        } satisfies SkillMaterializationFacts;
      });
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    return {
      type: "skill",
      isInstalled: Effect.fn("SkillManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(ws, "skill", target.name);
      }),

      materializeInstall,
      acquireCanonical: ({ ref, force }) =>
        Effect.gen(function* () {
          const locked = yield* ws.getLockedSkill(ref.skill.name);
          const materialized = yield* materializeSkillCanonical({
            ref,
            sanitizedName: sanitizeName(ref.skill.name),
            baseDir,
            layout: ws.layout,
            reuse: {
              force: force === true,
              lockedVersion:
                ref.refType === "registry" ? acceptedRegistryVersionForRef(locked, ref) : undefined,
              lockedTreeIntegrity: Option.isSome(locked) ? locked.value.treeIntegrity : undefined,
            },
          });
          const sourceHash =
            ref.refType === "workspace"
              ? ref.sourceHash
              : ref.refType === "registry"
                ? yield* computePackageContentHash(path.dirname(materialized.skillSrcPath))
                : yield* computeSkillSourceHash(materialized.skillSrcPath);
          return {
            sourceHash: Option.some(sourceHash),
            treeIntegrity: Option.fromUndefinedOr(materialized.treeIntegrity),
            observation: { agents: [], targets: [] },
          };
        }),
      materializeRetained: ({ target }) =>
        Effect.gen(function* () {
          const canonical = yield* usableAcceptedCanonical({
            workspace: ws,
            type: "skill",
            name: target.name,
          });
          if (Option.isNone(canonical) || canonical.value.ref.type !== "skill") {
            return yield* new LifecyclePostconditionViolated({
              postcondition: "materialize-observable",
              targetType: "skill",
              targetName: target.name,
            });
          }
          return yield* materializeInstall({ ref: canonical.value.ref });
        }),
      prepareSourceTransition: ({ ref }) =>
        prepareAcceptedCanonicalTransition({
          workspace: ws,
          type: "skill",
          name: ref.skill.name,
          ref,
        }),
      getConfiguredSource: Effect.fn("SkillManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredSkillEntries();
        const entry = configured[target.name];
        if (entry?.origin === "bundled") {
          return Option.some(`bundled:@agentxm/skills/${target.name}`);
        }
        return Option.fromUndefinedOr(entry?.source);
      }),
      listMaterializable: Effect.fn("SkillManager.listMaterializable")(function* () {
        const configured = yield* ws.records
          .rows("skill")

          .pipe(Effect.map(configuredRowsByName));
        const configuredEntries = yield* ws.getConfiguredSkillEntries();
        const configuredWithoutBundled = Object.fromEntries(
          Object.entries(configured).filter(
            ([name]) => configuredEntries[name]?.origin !== "bundled",
          ),
        );
        const workspaceRefs = yield* configuredSkillsToDiskRefs(
          { fs, path, baseDir, scope: ws.scope, layout: ws.layout },
          configuredWithoutBundled,
        );
        const trustedRefs = yield* Effect.forEach(
          enabledConfiguredEntries(configured),
          ([name]) =>
            configuredEntries[name]?.origin === "bundled"
              ? Effect.succeed(Option.none<SkillExtensionRef>())
              : usableAcceptedCanonicalRef({ workspace: ws, type: "skill", name }).pipe(
                  Effect.map(
                    Option.filter((ref): ref is SkillExtensionRef => ref.type === "skill"),
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

      acceptedResolution: Effect.fn("SkillManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }: {
        readonly ref: SkillExtensionRef;
        readonly materialization: Option.Option<SkillMaterializationFacts>;
      }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(
                path,
                baseDir,
                ref.sourcePath ?? stripFileProtocol(ref.location),
              )
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* new SkillDefinitionInvalid({
            detail: `Local skill source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        if (ref.refType === "workspace") {
          return Option.none();
        }
        const sourceHash = Option.getOrUndefined(
          materialization.pipe(Option.flatMap((facts) => facts.sourceHash)),
        );
        const treeIntegrity = Option.getOrUndefined(
          materialization.pipe(Option.flatMap((facts) => facts.treeIntegrity)),
        );
        if (sourceHash === undefined || treeIntegrity === undefined) {
          return yield* new SkillInstallStateMissing({
            name: ref.skill.name,
            kind: "content-identity",
          });
        }
        const lockEntry = buildSkillLockEntry(
          ref,
          workspaceRelativeLocalSourcePath,
          sourceHash,
          treeIntegrity,
        );
        if (lockEntry === undefined) {
          return yield* new SkillInstallStateMissing({
            name: ref.skill.name,
            kind: "external-resolution",
          });
        }
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `skills.${ref.skill.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        return Option.some({ key: ref.skill.name, entry: lockEntry });
      }),

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies ExtensionManager<SkillExtensionRef, SkillMaterializationFacts, ManagerRequirements>;
  }),
);

// -----------------------------------------------------------------------------
// Internal materialization helpers
// -----------------------------------------------------------------------------
