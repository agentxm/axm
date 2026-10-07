import { nativeAuthorityRoots } from "@agentxm/workspace-kernel/locations";
import {
  type SkillManagerService,
  type SkillMaterializationFacts,
  SkillManager,
  acceptedResolutionFor,
  InstallStateMissing,
  makeBaseManagerMembers,
  listMaterializableFromAccepted,
  listMaterializableFromDisk,
  groupInstallTargetsByDirectory,
} from "@agentxm/workspace-kernel/materialization";

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
import { fromFileLocation } from "@agentxm/host-primitives";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  enabledConfiguredEntries,
  sanitizeName,
  computePackageContentHash,
  configuredRowsByName,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-kernel/workspace-state";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { SkillDefinitionInvalid } from "./errors.js";
import {
  CodingAgentRepository,
  applyProjectionPlans,
  applyProjectionPlansWithResults,
  nativeArtifactLocationOutcomes,
  retiredNativeArtifactLocationOutcomes,
  planSingletonProjection,
  observeAgentOutputs,
  captureSkillOutputSources,
} from "@agentxm/workspace-kernel/projection";
import { type MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import { computeSkillSourceHash } from "./source-hash.js";
import {
  ensureSkillAgentArtifact,
  materializeSkillCanonical,
  removeSkillAgentArtifact,
} from "./materialization.js";
import {
  configuredSkillsToDiskRefs,
  retireCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";

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
    const nativeRoots = nativeAuthorityRoots(
      path,
      { workspaceRoot: baseDir, scope: location.scope },
      location.nativeDirectoryInputs,
    );

    const materializeInstall: SkillManagerService["materializeInstall"] = Effect.fn(
      "SkillManager.materializeInstall",
    )(function* ({ ref, force, nativeInsertionEligible, nativeInsertionEligiblePaths }) {
      const sanitized = sanitizeName(ref.skill.name);

      const lockedEntry = yield* lockfile.entry("skill", ref.skill.name);
      const previousCanonicalSkillSrcPaths = yield* captureSkillOutputSources(ref.skill.name);

      const materialized = yield* materializeSkillCanonical({
        ref,
        sanitizedName: sanitized,
        baseDir,
        layout: currentLayout(),
        reuse: {
          force: force === true,
          accepted: lockedEntry,
          nativeInsertionEligible: nativeInsertionEligible === true,
        },
      });
      const skillSrcPath = materialized.skillSrcPath;

      const configuredAgents = yield* agentRepo
        .getMaterializationAgents()
        .pipe(Effect.provideService(SettingsReader, settings));
      const resolved = yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .resolveEffectiveSkillsDir({ workspaceRoot: baseDir, scope: location.scope })
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

      const installTargets: Array<{
        readonly agentId: MaterializationTargetId;
        readonly dir: string;
      }> = [];
      for (const { agent, outcome } of resolved) {
        if (outcome._tag === "supported") {
          installTargets.push({ agentId: agent.id, dir: path.normalize(outcome.dir) });
        }
      }
      const locations = yield* groupInstallTargetsByDirectory(
        installTargets.map(({ agentId, dir }) => ({ agentId, targetDir: dir })),
        baseDir,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new SkillDefinitionInvalid({
              detail: "Cannot resolve physical Skill locations",
              cause,
            }),
        ),
      );

      const changes = yield* applyProjectionPlansWithResults(
        locations.map((location) => {
          const targetFile = path.join(location.targetDir, sanitized);
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
                  nativeRoots,
                  nativeInsertionEligible:
                    nativeInsertionEligible === true ||
                    nativeInsertionEligiblePaths?.has(location.targetDir) === true,
                  canonicalSkillSrcPath: skillSrcPath,
                  requiresPackageContext:
                    "distribution" in ref &&
                    ref.distribution !== undefined &&
                    ref.distribution.componentPath !== ".",
                  previousCanonicalSkillSrcPaths,
                  targetDir: location.targetDir,
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
          nativeLocations: yield* nativeArtifactLocationOutcomes({
            workspaceRoot: baseDir,
            scope: location.scope,
            agents: yield* agentRepo.all,
            configuredAgentIds: new Set(configuredAgents.map((agent) => agent.id)),
            sharedSkillPolicy: true,
            targets: locations.map((target, index) => ({
              path: path.join(target.targetDir, sanitized),
              kind: "skill",
              sourcePath: skillSrcPath,
              state: changes[index] ?? "unverified",
            })),
          }).pipe(
            Effect.mapError(
              (cause) =>
                new SkillDefinitionInvalid({
                  detail: "Cannot observe native Skill locations",
                  cause,
                }),
            ),
          ),
          agents: Array.dedupe(installTargets.map((target) => target.agentId)),
          targets: locations.map((location) => {
            const agentIds = location.agentIds;
            return {
              path: path.relative(baseDir, path.join(location.targetDir, sanitized)),
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

        const layout = currentLayout();
        const canonical = yield* acceptedCanonicalObservation({ type: "skill", name: target.name });
        const canonicalRoot = Option.isSome(canonical)
          ? canonical.value.observation.path
          : undefined;
        const portable =
          Option.isSome(canonical) &&
          canonical.value.accepted !== undefined &&
          (canonical.value.accepted.source.type === "http"
            ? canonical.value.accepted.source.portable
            : canonical.value.accepted.identity.owner === undefined);
        const distribution =
          Option.isSome(canonical) &&
          canonical.value.accepted !== undefined &&
          "distribution" in canonical.value.accepted.source
            ? canonical.value.accepted.source.distribution
            : undefined;
        const canonicalSkillSrcPath =
          canonicalRoot === undefined
            ? undefined
            : portable
              ? path.join(canonicalRoot, distribution?.componentPath ?? ".")
              : path.join(canonicalRoot, "src");
        const configuredAgentIds = new Set(yield* settings.configuredAgents);
        const inventory = yield* observeAgentOutputs({
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          workspaceRoot: baseDir,
          scope: location.scope,
          desiredAgentIds: configuredAgentIds,
          expectedNames: {
            skill: new Set<string>(),
            subagent: new Set<string>(),
            hook: new Set<string>(),
            "mcp-server": new Set<string>(),
          },
          expectedSkillSources:
            canonicalSkillSrcPath === undefined ? {} : { [sanitized]: [canonicalSkillSrcPath] },
          expectedSubagentFiles: {},
          expectedMcpEntries: {},
          expectedHooks: [],
          authoredSkills: { layout, entries: yield* settings.entries("skill") },
        }).pipe(Effect.provideService(CodingAgentRepository, agentRepo));
        const distinctDirs = [
          ...new Set(
            inventory.outputs
              .filter(
                (output) =>
                  output.extensionType === "skill" &&
                  output.entryName === sanitized &&
                  output.ownership === "owned",
              )
              .map((output) => path.dirname(output.path)),
          ),
        ];
        const nativeBefore = yield* nativeArtifactLocationOutcomes({
          workspaceRoot: baseDir,
          scope: location.scope,
          agents: yield* agentRepo.all,
          configuredAgentIds,
          sharedSkillPolicy: true,
          targets: distinctDirs.map((dir) => ({
            path: path.join(dir, sanitized),
            kind: "skill",
            state: "unchanged",
            ...(canonicalSkillSrcPath === undefined ? {} : { sourcePath: canonicalSkillSrcPath }),
          })),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new SkillDefinitionInvalid({
                detail: "Cannot observe native Skill removal targets",
                cause,
              }),
          ),
        );
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
                    nativeRoots,
                    targetDir: dir,
                    sanitizedName: sanitized,
                    ...(canonicalSkillSrcPath === undefined ? {} : { canonicalSkillSrcPath }),
                    baseDir,
                  }),
              },
            });
          }),
        );

        const nativeLocations = yield* retiredNativeArtifactLocationOutcomes(nativeBefore).pipe(
          Effect.mapError(
            (cause) =>
              new SkillDefinitionInvalid({
                detail: "Cannot observe retired native Skill locations",
                cause,
              }),
          ),
        );
        if (!retainCanonical) {
          const packageRoot = removableAcceptedCanonicalPath(canonical);
          if (Option.isSome(packageRoot)) yield* retireCanonicalDirectory(packageRoot.value);
        }
        return {
          sourceHash: Option.none(),
          treeIntegrity: Option.none(),
          observation: {
            nativeLocations,
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
      ...makeBaseManagerMembers({
        type: "skill",
        spanPrefix: "SkillManager",
        records,
        settings,
        refName: (ref) => ref.skill.name,
        materializeInstall,
      }),
      materializeInstall,
      acquireCanonical: ({ ref, force, nativeInsertionEligible }) =>
        Effect.gen(function* () {
          const locked = yield* lockfile.entry("skill", ref.skill.name);
          const materialized = yield* materializeSkillCanonical({
            ref,
            sanitizedName: sanitizeName(ref.skill.name),
            baseDir,
            layout: currentLayout(),
            reuse: {
              force: force === true,
              accepted: locked,
              nativeInsertionEligible: nativeInsertionEligible === true,
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
      // Bundled skills declare their source through origin, not source.
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
        const workspaceRefs = yield* listMaterializableFromDisk({
          type: "skill",
          records,
          configured: configuredWithoutBundled,
          toDiskRefs: configuredSkillsToDiskRefs,
          env: { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
        });
        const trustedRefs = yield* listMaterializableFromAccepted({
          type: "skill",
          names: Effect.succeed(
            enabledConfiguredEntries(configured)
              .filter(([name]) => configuredEntries[name]?.origin !== "bundled")
              .map(([name]) => name),
          ),
        });
        const refsByName = new Map(workspaceRefs.map((ref) => [ref.skill.name, ref]));
        for (const ref of trustedRefs) {
          refsByName.set(ref.skill.name, ref);
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
                ref.sourcePath ?? fromFileLocation(ref.location),
              )
            : Option.none();
        return yield* acceptedResolutionFor({
          ref,
          acquired: Option.map(
            Option.flatMap(materialization, (facts) =>
              Option.map(facts.treeIntegrity, (treeIntegrity) => ({ treeIntegrity })),
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
