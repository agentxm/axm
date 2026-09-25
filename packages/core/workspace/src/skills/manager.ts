import { LifecyclePostconditionViolated } from "../transitions/planning/index.js";
import type { SkillManagerService } from "../materialization/managers.js";
import { usableAcceptedCanonical } from "../desired-state/index.js";

/**
 * Skill extension manager service.
 *
 * Implements Skill materialization with native/non-native
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
import * as Ref from "effect/Ref";
import {
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../desired-state/index.js";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { configuredSkillsToDiskRefs } from "../acquisition/materializable-from-disk.js";
import { enabledConfiguredEntries } from "../desired-state/index.js";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SkillMaterializationFacts } from "../materialization/managers.js";
import type { ExtensionTarget } from "../desired-state/index.js";
import { sanitizeName } from "../desired-state/index.js";
import { computePackageContentHash } from "../desired-state/index.js";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { removeIfExists } from "../desired-state/index.js";
import { SkillManager } from "../materialization/managers.js";
import {
  acceptedResolutionFor,
  InstallStateMissing,
} from "../materialization/accepted-resolution.js";
import { SkillDefinitionInvalid } from "./errors.js";
import {
  CodingAgentRepository,
  applyProjectionPlans,
  planSingletonProjection,
} from "../projection/index.js";
import { type AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { computeSkillSourceHash } from "./source-hash.js";
import {
  ensureSkillAgentArtifact,
  materializeSkillCanonical,
  removeSkillAgentArtifact,
} from "./materialization.js";
import { configuredRowsByName } from "../desired-state/index.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
  usableAcceptedCanonicalRef,
} from "../desired-state/index.js";
import { isObservedInstalled } from "../desired-state/index.js";

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const SkillManagerLive = Layer.effect(
  SkillManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const records = yield* WorkspaceRecords;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = location.baseDir;

    const materializeInstall: SkillManagerService["materializeInstall"] = Effect.fn(
      "SkillManager.materializeInstall",
    )(function* ({ ref, force }) {
      const sanitized = sanitizeName(ref.skill.name);

      const lockedEntry = yield* lockfile.entry("skill", ref.skill.name);

      const materialized = yield* materializeSkillCanonical({
        ref,
        sanitizedName: sanitized,
        baseDir,
        layout: currentLayout(),
        reuse: { force: force === true, accepted: lockedEntry },
      });
      const skillSrcPath = materialized.skillSrcPath;

      const configuredAgents = yield* agentRepo
        .getMaterializationAgents()
        .pipe(Effect.provideService(SettingsReader, settings));
      const resolved = yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .resolveEffectiveSkillsDir({ workspaceRoot: baseDir })
            .pipe(Effect.map((outcome) => ({ agent, outcome }))),
        // eslint-disable-next-line axm-policy/no-unbounded-io -- configured agents are a subset of the fixed agent catalog
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
        return yield* new InstallStateMissing({ type: "skill", name: ref.skill.name });
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
    ): SkillManagerService["materializeUninstall"] =>
      Effect.fn("SkillManager.materializeRemoval")(function* ({ target }) {
        const sanitized = sanitizeName(target.name);

        const configuredAgents = yield* agentRepo
          .getMaterializationAgents()
          .pipe(Effect.provideService(SettingsReader, settings));
        const resolved = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent
              .resolveEffectiveSkillsDir({ workspaceRoot: baseDir })
              .pipe(Effect.map((outcome) => ({ agent, outcome }))),
          // eslint-disable-next-line axm-policy/no-unbounded-io -- configured agents are a subset of the fixed agent catalog
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
      isInstalled: Effect.fn("SkillManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(records, "skill", target.name);
      }),

      materializeInstall,
      acquireCanonical: ({ ref, force }) =>
        Effect.gen(function* () {
          const locked = yield* lockfile.entry("skill", ref.skill.name);
          const materialized = yield* materializeSkillCanonical({
            ref,
            sanitizedName: sanitizeName(ref.skill.name),
            baseDir,
            layout: currentLayout(),
            reuse: { force: force === true, accepted: locked },
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
          type: "skill",
          name: ref.skill.name,
          ref,
        }),
      getConfiguredSource: Effect.fn("SkillManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* settings.entries("skill");
        const entry = configured[target.name];
        if (entry?.origin === "bundled") {
          return Option.some(`bundled:@agentxm/skills/${target.name}`);
        }
        return Option.fromUndefinedOr(entry?.source);
      }),
      listMaterializable: Effect.fn("SkillManager.listMaterializable")(function* () {
        const configured = yield* records
          .rows("skill")

          .pipe(Effect.map(configuredRowsByName));
        const configuredEntries = yield* settings.entries("skill");
        const configuredWithoutBundled = Object.fromEntries(
          Object.entries(configured).filter(
            ([name]) => configuredEntries[name]?.origin !== "bundled",
          ),
        );
        const workspaceRefs = yield* configuredSkillsToDiskRefs(
          { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
          configuredWithoutBundled,
        );
        const trustedRefs = yield* Effect.forEach(
          enabledConfiguredEntries(configured),
          ([name]) =>
            configuredEntries[name]?.origin === "bundled"
              ? Effect.succeed(Option.none<SkillExtensionRef>())
              : usableAcceptedCanonicalRef({ type: "skill", name }).pipe(
                  Effect.map(
                    Option.filter((ref): ref is SkillExtensionRef => ref.type === "skill"),
                  ),
                ),
          { concurrency: 16 },
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
        return yield* acceptedResolutionFor({
          ref,
          acquired: Option.map(
            Option.flatMap(materialization, (facts) =>
              Option.all({ sourceHash: facts.sourceHash, treeIntegrity: facts.treeIntegrity }),
            ),
            (identity) => ({ ...identity, workspaceRelativeLocalSourcePath }),
          ),
        });
      }),

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies SkillManagerService;
  }),
);

// -----------------------------------------------------------------------------
// Internal materialization helpers
// -----------------------------------------------------------------------------
