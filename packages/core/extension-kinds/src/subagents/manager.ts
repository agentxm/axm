/** Subagent package acquisition and native implementation materialization. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { fromFileLocation } from "@agentxm/host-primitives";
import { loadSubagentPackage, type DecodedSubagentPackage } from "@agentxm/extension-content";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities";
import { MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import {
  assertNativeMutationWithinRoots,
  combineNativeLocationOutcomes,
  nativeAuthorityRoots,
} from "@agentxm/workspace-kernel/locations";
import {
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  computeExtensionPathsForLayout,
  sanitizeName,
  computeMaterializedTreeIntegrity,
  computePackageContentHash,
  acceptedCanonicalObservation,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  SubagentManager,
  type SubagentManagerService,
  type SubagentMaterializationFacts,
  acceptedResolutionFor,
  acquireCanonicalForRef,
  verifyWorkspaceRefLocation,
  makeBaseManagerMembers,
  listMaterializableFromDisk,
} from "@agentxm/workspace-kernel/materialization";
import {
  CodingAgentRepository,
  captureAgentOutputAuthority,
  compileSubagentImplementation,
  managedFileFormatForPath,
  managedFileMarker,
  observeAgentOutputs,
  nativeArtifactLocationOutcomes,
  retiredNativeArtifactLocationOutcomes,
  managedSubagentFile,
  type AgentOutputAuthority,
  applyProjectionPlansWithResults,
  planSingletonProjection,
} from "@agentxm/workspace-kernel/projection";
import { SubagentIoFailed, removeSubagentFiles } from "@agentxm/workspace-kernel/agent-adapters";
import {
  acquiredDirectoryForRef,
  configuredSubagentsToDiskRefs,
  retireCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-kernel/operations";
import { SubagentDefinitionInvalid, SubagentNativeConflict } from "./errors.js";

export const SubagentManagerLive = Layer.effect(
  SubagentManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const records = yield* WorkspaceRecords;
    const sources = yield* SourceHostProviders;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const baseDir = location.baseDir;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const nativeRoots = nativeAuthorityRoots(
      path,
      { workspaceRoot: baseDir, scope: location.scope },
      location.nativeDirectoryInputs,
    );
    const getCanonicalPaths = (ref: SubagentExtensionRef) =>
      computeExtensionPathsForLayout(
        path.join,
        currentLayout(),
        ref,
        "subagents",
        sanitizeName(ref.subagent.name),
      );
    const readPackage = (root: string) =>
      loadSubagentPackage(root).pipe(
        Effect.mapError(
          (cause) =>
            new SubagentDefinitionInvalid({
              detail: `Invalid Subagent package at ${root}: ${cause.detail}`,
              cause,
            }),
        ),
      );
    const provenance = (ref: SubagentExtensionRef) =>
      managedSubagentFile(
        ref,
        path.relative(baseDir, path.join(getCanonicalPaths(ref).canonicalPath, MANIFEST_FILENAME)),
      );
    const preparedTargets = (
      ref: SubagentExtensionRef,
      pkg: DecodedSubagentPackage,
      configuredAgents?: ReadonlyArray<string>,
    ) =>
      Effect.gen(function* () {
        const agents = yield* configuredAgents === undefined
          ? agentRepo.getConfiguredAgents().pipe(Effect.provideService(SettingsReader, settings))
          : Effect.forEach(configuredAgents, (id) =>
              isConfigurableAgentId(id)
                ? agentRepo.get(id)
                : Effect.fail(
                    new SubagentDefinitionInvalid({ detail: `Unknown configured runtime: ${id}` }),
                  ),
            );
        return yield* Effect.forEach(agents, (agent) =>
          Effect.gen(function* () {
            const compiled = compileSubagentImplementation({
              package: pkg,
              agentId: agent.id,
              managedFile: provenance(ref),
            });
            const directory = yield* agent.resolveEffectiveSubagentsDir({
              workspaceRoot: baseDir,
              scope: location.scope,
            });
            return { agent, compiled, directory };
          }),
        );
      });
    type PreparedTargets = Effect.Success<ReturnType<typeof preparedTargets>>;
    const outcomeForTarget = (
      ref: SubagentExtensionRef,
      target: PreparedTargets[number],
      state: "projected" | "current",
    ): ConfiguredAgentOutcome => {
      const common = {
        extensionType: "subagent" as const,
        name: ref.subagent.name,
        agentId: target.agent.id,
      };
      if (target.directory._tag === "disabled")
        return {
          ...common,
          outcome: "not-applicable",
          reasonCode: "subagent-placement-disabled",
          reason: target.directory.reason,
        };
      if (target.directory._tag === "misconfigured")
        return {
          ...common,
          outcome: "blocked",
          reasonCode: "subagent-placement-misconfigured",
          reason: target.directory.reason,
        };
      if (target.compiled._tag === "Unsupported")
        return {
          ...common,
          outcome: "unsupported",
          reasonCode: target.compiled.reasonCode,
          reason: target.compiled.reason,
          ...(target.compiled.mode === undefined ? {} : { mechanism: target.compiled.mode }),
        };
      if (target.directory._tag !== "supported")
        return {
          ...common,
          outcome: "unsupported",
          mechanism: target.compiled.mode,
          reasonCode: `subagent-placement-${target.directory._tag}`,
          reason: target.directory.reason,
        };
      return {
        ...common,
        outcome: state,
        mechanism: target.compiled.mode,
        reasonCode: "subagent-native-implementation",
        reason: `${target.compiled.mode} implementation for ${target.compiled.nativeName}`,
        path: target.directory.dir,
      };
    };
    const readPackageForRef = (
      ref: SubagentExtensionRef,
      state: "projected" | "current",
      options?: { readonly sourceRoot?: string },
    ) =>
      Effect.gen(function* () {
        if (options?.sourceRoot !== undefined) return yield* readPackage(options.sourceRoot);
        const canonical = getCanonicalPaths(ref).canonicalPath;
        if (state === "current" && (yield* fs.exists(path.join(canonical, MANIFEST_FILENAME))))
          return yield* readPackage(canonical);
        if (ref.refType === "registry")
          return yield* Effect.scoped(
            Effect.gen(function* () {
              const { directory } = yield* sources.fetch(ref);
              return yield* readPackage(directory);
            }),
          );
        return yield* readPackage(fromFileLocation(ref.location));
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "PlatformError"
            ? new SubagentDefinitionInvalid({ detail: "Cannot inspect Subagent source", cause })
            : cause,
        ),
      );
    const configuredAgentOutcomesForRef: SubagentManagerService["configuredAgentOutcomesForRef"] = (
      ref,
      state,
      options,
    ) =>
      Effect.gen(function* () {
        const pkg = yield* readPackageForRef(ref, state, options);
        if (options?.validateDestinations === true)
          yield* preflight(
            ref,
            pkg,
            yield* captureAgentOutputAuthority(),
            options.configuredAgents,
          );
        return (yield* preparedTargets(ref, pkg, options?.configuredAgents)).map((target) =>
          outcomeForTarget(ref, target, state),
        );
      });
    const observeOwned = (name: string, authority: AgentOutputAuthority) =>
      observeAgentOutputs({
        nativeDirectoryInputs: location.nativeDirectoryInputs,
        workspaceRoot: baseDir,
        scope: location.scope,
        desiredAgentIds: new Set<string>(),
        expectedNames: {
          skill: new Set<string>(),
          subagent: new Set<string>(),
          hook: new Set<string>(),
          "mcp-server": new Set<string>(),
        },
        ...authority,
        authoredSkills: { layout: currentLayout(), entries: {} },
      }).pipe(
        Effect.provideService(CodingAgentRepository, agentRepo),
        Effect.map((inventory) =>
          inventory.outputs.filter(
            (output) =>
              output.extensionType === "subagent" &&
              output.entryName === name &&
              output.ownership === "owned",
          ),
        ),
      );
    const retireOutputs = (
      name: string,
      authority: AgentOutputAuthority,
      keep: ReadonlySet<string>,
    ) =>
      Effect.gen(function* () {
        const outputs = (yield* observeOwned(name, authority)).filter(
          (output) => !keep.has(output.path),
        );
        const before = yield* nativeArtifactLocationOutcomes({
          workspaceRoot: baseDir,
          scope: location.scope,
          agents: yield* agentRepo.all,
          configuredAgentIds: new Set(yield* settings.configuredAgents),
          sharedSkillPolicy: false,
          targets: outputs.map((output) => ({
            path: output.path,
            kind: "subagent" as const,
            state: "unchanged" as const,
          })),
        });
        const withdrawn = [];
        for (const output of outputs) {
          for (const expectedManagedFile of authority.expectedSubagentFiles[name] ?? []) {
            const result = yield* removeSubagentFiles({
              nativeRoots,
              workspaceRoot: baseDir,
              scope: location.scope,
              subagentName: name,
              expectedManagedFile,
              renderedFilePaths: [path.relative(baseDir, output.path)],
            });
            if (result._tag === "success" && result.renderedFilePaths.length > 0) {
              withdrawn.push(output);
              break;
            }
          }
        }
        return {
          outputs: withdrawn,
          nativeLocations: yield* retiredNativeArtifactLocationOutcomes(before),
        };
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SubagentIoFailed({ detail: "Cannot retire obsolete Subagent outputs", cause }),
        ),
      );
    const preflight = (
      ref: SubagentExtensionRef,
      pkg: DecodedSubagentPackage,
      authority: AgentOutputAuthority,
      configuredAgents?: ReadonlyArray<string>,
    ) =>
      Effect.gen(function* () {
        const managedFile = provenance(ref);
        const previous = authority.expectedSubagentFiles[ref.subagent.name] ?? [];
        const proofs = [...previous, { ext: managedFile.ext, src: managedFile.source.path }];
        const claims = new Map<string, string>();
        for (const target of yield* preparedTargets(ref, pkg, configuredAgents)) {
          if (target.directory._tag === "misconfigured")
            return yield* new SubagentDefinitionInvalid({ detail: target.directory.reason });
          if (target.directory._tag !== "supported" || target.compiled._tag !== "Compiled")
            continue;
          for (const output of target.compiled.outputs) {
            const { address } = yield* assertNativeMutationWithinRoots(
              nativeRoots,
              path.join(target.directory.dir, output.path),
              "content",
              baseDir,
            );
            const destination = address.referentPath ?? address.entryPath;
            const prior = claims.get(destination);
            if (prior !== undefined && prior !== output.content)
              return yield* new SubagentNativeConflict({
                detail: `Configured consumers require incompatible Subagent bytes at ${destination}`,
              });
            claims.set(destination, output.content);
            if (address.kind === "absent") continue;
            const raw = yield* fs.readFileString(destination).pipe(Effect.option);
            const format = managedFileFormatForPath(output.path);
            const marker =
              Option.isNone(raw) || format === undefined
                ? Option.none()
                : managedFileMarker(raw.value, format);
            if (
              Option.isNone(marker) ||
              !proofs.some(
                (proof) => proof.ext === marker.value.ext && proof.src === marker.value.src,
              )
            ) {
              return yield* new SubagentNativeConflict({
                detail: `Preserved unowned Subagent file: ${destination}`,
              });
            }
          }
        }
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof SubagentDefinitionInvalid || cause instanceof SubagentNativeConflict
            ? cause
            : new SubagentDefinitionInvalid({
                detail: "Subagent native destination preflight failed",
                cause,
              }),
        ),
      );
    const materializeCanonical = (
      ref: SubagentExtensionRef,
      force: boolean,
      nativeInsertionEligible: boolean,
      project: boolean,
    ) =>
      Effect.gen(function* () {
        const { canonicalPath } = getCanonicalPaths(ref);
        const authority = yield* captureAgentOutputAuthority();
        const validate = (root: string) =>
          Effect.gen(function* () {
            const pkg = yield* readPackage(root);
            if (project) yield* preflight(ref, pkg, authority);
          });
        if (ref.refType === "workspace") {
          yield* verifyWorkspaceRefLocation({
            ref,
            scope: location.scope,
            canonicalPath,
            invalid: (detail) => new SubagentDefinitionInvalid({ detail }),
          });
          yield* validate(canonicalPath);
          return yield* computeMaterializedTreeIntegrity(canonicalPath);
        }
        if (ref.refType !== "registry")
          yield* validate(yield* acquiredDirectoryForRef(ref, fromFileLocation(ref.location)));
        const materialized = yield* acquireCanonicalForRef({
          ref,
          type: "subagent",
          nativeInsertionEligible,
          baseDir,
          canonicalPath,
          accepted: yield* lockfile.entry("subagent", ref.subagent.name),
          force,
          validate,
          copyFailure: {
            code: "internal",
            detail: (target) => `Failed to copy subagent files to ${target}`,
          },
          external: { sourcePath: (packageRoot) => packageRoot, targetPath: canonicalPath },
        });
        if (materialized.reused) yield* validate(canonicalPath);
        return materialized.treeIntegrity;
      });
    const materializeInstall: SubagentManagerService["materializeInstall"] = Effect.fn(
      "SubagentManager.materializeInstall",
    )(
      function* ({ ref, force, nativeInsertionEligible, nativeInsertionEligiblePaths }) {
        const { canonicalPath } = getCanonicalPaths(ref);
        const authority = yield* captureAgentOutputAuthority();
        const previousManagedFiles = authority.expectedSubagentFiles[ref.subagent.name] ?? [];
        const treeIntegrity = yield* materializeCanonical(
          ref,
          force === true,
          nativeInsertionEligible === true,
          true,
        );
        const pkg = yield* readPackage(canonicalPath);
        const targets = yield* preparedTargets(ref, pkg);
        const writable = targets.filter(
          (target) => target.directory._tag === "supported" && target.compiled._tag === "Compiled",
        );
        const results = yield* applyProjectionPlansWithResults(
          writable.map((target) =>
            planSingletonProjection({
              unitId: "subagent:native-profile",
              targetFile: `subagent:${ref.subagent.name}:configured-agents`,
              contributor: ref,
              adapter: {
                observe: () =>
                  Effect.succeed({
                    unitId: "subagent:native-profile",
                    path: `${target.agent.id}:${ref.subagent.name}`,
                    present: false,
                    current: false,
                    expectedContributors: [ref.subagent.name],
                    observedContributors: [],
                  }),
                apply: () =>
                  Effect.gen(function* () {
                    if (target.compiled._tag !== "Compiled")
                      return yield* new SubagentDefinitionInvalid({
                        detail: "Subagent implementation changed after preparation",
                      });
                    const outcome = yield* target.agent.addSubagent({
                      workspaceRoot: baseDir,
                      scope: location.scope,
                      previousManagedFiles,
                      nativeRoots,
                      nativeInsertionEligible: nativeInsertionEligible === true,
                      ...(nativeInsertionEligiblePaths === undefined
                        ? {}
                        : { nativeInsertionEligiblePaths }),
                      input: target.compiled.input,
                      force: false,
                    });
                    if (outcome._tag !== "success")
                      return yield* new SubagentDefinitionInvalid({ detail: outcome.reason });
                    return { agentId: target.agent.id, outcome };
                  }),
              },
            }),
          ),
        );
        const successful = results;
        const keep = new Set<string>();
        for (const { outcome } of successful)
          for (const file of outcome.renderedFilePaths) {
            const { address } = yield* assertNativeMutationWithinRoots(
              nativeRoots,
              path.resolve(baseDir, file),
              "content",
              baseDir,
            );
            keep.add(address.referentPath ?? address.entryPath);
          }
        const managedFile = provenance(ref);
        const currentAuthority = {
          ...authority,
          expectedSubagentFiles: {
            ...authority.expectedSubagentFiles,
            [ref.subagent.name]: [
              ...previousManagedFiles,
              { ext: managedFile.ext, src: managedFile.source.path },
            ],
          },
        };
        const retired = yield* retireOutputs(ref.subagent.name, currentAuthority, keep);
        const agentIdsByPath = new Map<string, string[]>();
        for (const { agentId, outcome } of successful)
          for (const file of outcome.renderedFilePaths) {
            const relative = path.relative(baseDir, path.resolve(baseDir, file));
            const ids = agentIdsByPath.get(relative) ?? [];
            if (!ids.includes(agentId)) ids.push(agentId);
            agentIdsByPath.set(relative, ids);
          }
        const nativeLocations = yield* nativeArtifactLocationOutcomes({
          workspaceRoot: baseDir,
          scope: location.scope,
          agents: yield* agentRepo.all,
          configuredAgentIds: new Set(targets.map(({ agent }) => agent.id)),
          sharedSkillPolicy: false,
          targets: successful.flatMap(({ outcome }) =>
            (outcome.nativeTargets ?? []).map((target) => ({
              path: target.path,
              kind: target.kind,
              state: target.change,
            })),
          ),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({ detail: "Cannot observe native Subagent locations", cause }),
          ),
        );
        return {
          sourceHash: Option.some(yield* computePackageContentHash(canonicalPath)),
          treeIntegrity: Option.fromUndefinedOr(treeIntegrity),
          observation: {
            nativeLocations: combineNativeLocationOutcomes([
              ...nativeLocations,
              ...retired.nativeLocations,
            ]),
            agents: successful.map(({ agentId }) => agentId),
            agentOutcomes: targets.map((target) => outcomeForTarget(ref, target, "projected")),
            targets: [...agentIdsByPath]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([file, agentIds]) => ({ path: file, agentIds })),
          },
        } satisfies SubagentMaterializationFacts;
      },
      Effect.mapError((cause) =>
        cause._tag === "NativeLocationError"
          ? new SubagentIoFailed({ detail: "Cannot resolve Subagent output", cause })
          : cause,
      ),
    );
    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): SubagentManagerService["materializeUninstall"] =>
      Effect.fn("SubagentManager.materializeRemoval")(function* ({ target }) {
        const canonical = yield* acceptedCanonicalObservation({
          type: "subagent",
          name: target.name,
        });
        const retired = yield* retireOutputs(
          target.name,
          yield* captureAgentOutputAuthority(),
          new Set(),
        );
        if (!retainCanonical) {
          const root = removableAcceptedCanonicalPath(canonical);
          if (Option.isSome(root)) yield* retireCanonicalDirectory(root.value);
        }
        return {
          sourceHash: Option.none(),
          treeIntegrity: Option.none(),
          observation: {
            nativeLocations: retired.nativeLocations,
            agents: [
              ...new Set(retired.outputs.flatMap((output) => output.claimantAgentIds)),
            ].sort(),
            targets: retired.outputs.map((output) => ({
              path: path.relative(baseDir, output.path),
              agentIds: output.claimantAgentIds,
            })),
          },
        };
      });
    const projectionObservation: SubagentManagerService["projectionObservation"] = (ref, options) =>
      Effect.gen(function* () {
        const pkg = yield* readPackage(options?.sourceRoot ?? getCanonicalPaths(ref).canonicalPath);
        yield* preflight(ref, pkg, yield* captureAgentOutputAuthority(), options?.configuredAgents);
        const targets = yield* preparedTargets(ref, pkg, options?.configuredAgents);
        const allAgents = yield* agentRepo.all;
        const observations = [];
        const expectedPaths = new Set<string>();
        for (const target of targets) {
          if (target.directory._tag === "misconfigured") {
            observations.push({ present: false, current: false, nativeLocations: [] });
            continue;
          }
          if (target.directory._tag !== "supported" || target.compiled._tag !== "Compiled")
            continue;
          for (const output of target.compiled.outputs) {
            const file = path.resolve(target.directory.dir, output.path);
            const { address } = yield* assertNativeMutationWithinRoots(
              nativeRoots,
              file,
              "content",
              baseDir,
            );
            expectedPaths.add(address.referentPath ?? address.entryPath);
            const content = yield* fs.readFileString(file).pipe(Effect.option);
            const format = managedFileFormatForPath(output.path);
            const actual =
              Option.isNone(content) || format === undefined
                ? Option.none()
                : managedFileMarker(content.value, format);
            const expected =
              format === undefined ? Option.none() : managedFileMarker(output.content, format);
            const owned =
              Option.isSome(actual) &&
              Option.isSome(expected) &&
              actual.value.ext === expected.value.ext &&
              actual.value.src === expected.value.src;
            const current =
              owned &&
              Option.isSome(actual) &&
              Option.isSome(expected) &&
              actual.value.generation === expected.value.generation;
            const nativeLocations = yield* nativeArtifactLocationOutcomes({
              workspaceRoot: baseDir,
              scope: location.scope,
              agents: allAgents,
              configuredAgentIds: new Set(targets.map(({ agent }) => agent.id)),
              sharedSkillPolicy: false,
              targets: [
                {
                  path: file,
                  kind: "subagent",
                  state: current ? "unchanged" : Option.isNone(content) ? "created" : "updated",
                },
              ],
            });
            observations.push({
              present: Option.isSome(content),
              current,
              nativeLocations: nativeLocations.map((unit) => {
                const { proof: _proof, ...facts } = unit;
                return {
                  ...facts,
                  ownership: Option.isNone(content)
                    ? ("absent" as const)
                    : owned
                      ? ("owned" as const)
                      : ("unowned" as const),
                  ...(owned ? { proof: "exact-accepted-managed-file" } : {}),
                };
              }),
            });
          }
        }
        const obsolete = (yield* observeOwned(
          ref.subagent.name,
          yield* captureAgentOutputAuthority(),
        )).some((output) => !expectedPaths.has(output.path));
        return {
          present: observations.every((item) => item.present),
          current: !obsolete && observations.every((item) => item.current),
          nativeLocations: combineNativeLocationOutcomes(
            observations.flatMap((item) => item.nativeLocations),
          ),
          agentOutcomes: targets.map((target) => outcomeForTarget(ref, target, "current")),
        };
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "NativeLocationError"
            ? new SubagentDefinitionInvalid({
                detail: "Cannot observe planned Subagent locations",
                cause,
              })
            : cause,
        ),
      );
    return {
      projectionObservation,
      configuredAgentOutcomesForRef,
      ...makeBaseManagerMembers({
        type: "subagent",
        spanPrefix: "SubagentManager",
        records,
        settings,
        refName: (ref) => ref.subagent.name,
        materializeInstall,
      }),
      materializeInstall,
      acquireCanonical: ({ ref, force, nativeInsertionEligible }) =>
        Effect.gen(function* () {
          const { canonicalPath } = getCanonicalPaths(ref);
          const treeIntegrity = yield* materializeCanonical(
            ref,
            force === true,
            nativeInsertionEligible === true,
            false,
          );
          return {
            sourceHash: Option.some(yield* computePackageContentHash(canonicalPath)),
            treeIntegrity: Option.fromUndefinedOr(treeIntegrity),
            observation: { agents: [], targets: [] },
          };
        }),
      listMaterializable: () =>
        listMaterializableFromDisk({
          type: "subagent",
          records,
          toDiskRefs: configuredSubagentsToDiskRefs,
          env: { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
        }),
      materializeUninstall: makeMaterializeRemoval(false),
      materializeDeactivate: makeMaterializeRemoval(true),
      acceptedResolution: Effect.fn("SubagentManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }: {
        readonly ref: SubagentExtensionRef;
        readonly materialization: Option.Option<SubagentMaterializationFacts>;
      }) {
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(
                path,
                baseDir,
                ref.sourcePath ?? fromFileLocation(ref.location),
              )
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath))
          return yield* new SubagentDefinitionInvalid({
            detail: `Local subagent source path must stay within the workspace root: ${ref.source.path}`,
          });
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
    } satisfies SubagentManagerService;
  }),
);
