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
  AcceptedResolutionWriter,
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
  type ProjectionRowChange,
  type ProjectionUnitPath,
  type RecordedProjectionRow,
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
  decideOutputDeletion,
  decideWholeFileWrite,
  extensionNameFromFilename,
  observeAgentOutputs,
  nativeArtifactLocationOutcomes,
  projectionIsCurrent,
  projectionOutputDigest,
  retainedOutputDetail,
  retiredNativeArtifactLocationOutcomes,
  subagentProjectionGeneration,
  subagentProvenance,
  subagentUnitPath,
  type AgentOutputAuthority,
  type AgentOutputObservation,
  applyProjectionPlansWithResults,
  planSingletonProjection,
} from "@agentxm/workspace-kernel/projection";
import {
  SubagentIoFailed,
  removeSubagentFiles,
  type SubagentWriteDecision,
} from "@agentxm/workspace-kernel/agent-adapters";
import type { NativeLocationOutcome } from "@agentxm/workspace-kernel/locations";
import {
  acquiredDirectoryForRef,
  configuredSubagentsToDiskRefs,
  retireCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import type {
  ConfiguredAgentOutcome,
  JobStepArtifactTarget,
} from "@agentxm/workspace-kernel/operations";
import { SubagentDefinitionInvalid, SubagentNativeConflict } from "./errors.js";

export const SubagentManagerLive = Layer.effect(
  SubagentManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const records = yield* WorkspaceRecords;
    const accepted = yield* AcceptedResolutionWriter;
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
    // The source path feeds a generation recorded in a shared lockfile, so it
    // is POSIX on every platform.
    const provenance = (ref: SubagentExtensionRef) =>
      subagentProvenance(
        ref,
        path
          .relative(baseDir, path.join(getCanonicalPaths(ref).canonicalPath, MANIFEST_FILENAME))
          .split(path.sep)
          .join("/"),
      );
    // Reading the rows decodes the lockfile, so a lockfile this CLI cannot
    // read refuses before any Subagent file is written or removed.
    const subagentRows = accepted.projectionRows("subagents");
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
            const compiled = compileSubagentImplementation({ package: pkg, agentId: agent.id });
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
    /**
     * Every planned Subagent file, keyed by its physical path. Configured
     * agents that read one physical file share its generation, so whichever
     * writes it records the same currency.
     */
    const plannedFiles = (ref: SubagentExtensionRef, targets: PreparedTargets) =>
      Effect.gen(function* () {
        const files = new Map<
          string,
          {
            readonly unit: ProjectionUnitPath;
            readonly content: string;
            readonly claimants: Array<{
              readonly provenance: ReturnType<typeof provenance>;
              readonly input: Extract<
                PreparedTargets[number]["compiled"],
                { readonly _tag: "Compiled" }
              >["input"];
            }>;
          }
        >();
        for (const target of targets) {
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
            const prior = files.get(destination);
            if (prior !== undefined && prior.content !== output.content)
              return yield* new SubagentNativeConflict({
                detail: `Configured consumers require incompatible Subagent bytes at ${destination}`,
              });
            const unit = subagentUnitPath(path, baseDir, destination);
            if (Option.isNone(unit))
              return yield* new SubagentDefinitionInvalid({
                detail: `Subagent output is outside the workspace scope root: ${destination}`,
              });
            const claimant = { provenance: provenance(ref), input: target.compiled.input };
            if (prior === undefined)
              files.set(destination, {
                unit: unit.value,
                content: output.content,
                claimants: [claimant],
              });
            else prior.claimants.push(claimant);
          }
        }
        return new Map(
          [...files].map(([destination, file]) => [
            destination,
            {
              unit: file.unit,
              content: file.content,
              gen: subagentProjectionGeneration(file.claimants),
            },
          ]),
        );
      });
    type PlannedFiles = Effect.Success<ReturnType<typeof plannedFiles>>;
    const decideAt = (args: {
      readonly planned: PlannedFiles;
      readonly rows: ReadonlyMap<ProjectionUnitPath, RecordedProjectionRow>;
      readonly destination: string;
      readonly bytes: Option.Option<string>;
      readonly replaceUnrecorded: boolean;
    }): SubagentWriteDecision => {
      const file = args.planned.get(args.destination);
      if (file === undefined)
        return {
          _tag: "conflict",
          reason: `Subagent file is not a planned destination: ${args.destination}`,
        };
      const decision = decideWholeFileWrite({
        recorded: Option.fromUndefinedOr(args.rows.get(file.unit)),
        gen: file.gen,
        bytes: args.bytes,
        rendered: file.content,
        replaceUnrecorded: args.replaceUnrecorded,
      });
      return decision._tag === "conflict"
        ? {
            _tag: "conflict",
            reason: `Existing Subagent file has no recorded projection: ${args.destination}; rerun with --replace-unrecorded to overwrite it`,
          }
        : decision._tag === "write"
          ? { _tag: "write" }
          : decision;
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
          yield* preflight(ref, pkg, options.configuredAgents);
        return (yield* preparedTargets(ref, pkg, options?.configuredAgents)).map((target) =>
          outcomeForTarget(ref, target, state),
        );
      });
    /** Native files of these names in every Subagent container, declared or not. */
    const observeNamed = (names: ReadonlySet<string>, authority: AgentOutputAuthority) =>
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
        expectedSubagentNames: new Set([...authority.expectedSubagentNames, ...names]),
        authoredSkills: { layout: currentLayout(), entries: {} },
      }).pipe(
        Effect.provideService(CodingAgentRepository, agentRepo),
        Effect.map((inventory) =>
          inventory.outputs.filter(
            (output) =>
              output.extensionType === "subagent" &&
              names.has(output.entryName) &&
              output.ownership === "owned",
          ),
        ),
      );
    /** The names a package's files carry: its own and each native name it renders. */
    const nativeNames = (ref: SubagentExtensionRef, targets: PreparedTargets) =>
      new Set([
        ref.subagent.name,
        ...targets.flatMap((target) =>
          target.compiled._tag === "Compiled" ? [target.compiled.nativeName] : [],
        ),
      ]);
    /**
     * An accepted Subagent's own name and every native name it renders, or
     * `None` when its accepted package cannot be read.
     */
    const acceptedNames = (name: string) =>
      Effect.gen(function* () {
        const canonical = yield* acceptedCanonicalObservation({ type: "subagent", name }).pipe(
          Effect.option,
        );
        const root = Option.flatMap(Option.flatten(canonical), (state) =>
          Option.fromUndefinedOr(state.observation.path),
        );
        if (Option.isNone(root)) return Option.none<ReadonlySet<string>>();
        const pkg = yield* readPackage(root.value).pipe(Effect.option);
        if (Option.isNone(pkg)) return Option.none<ReadonlySet<string>>();
        const agents = yield* agentRepo.all;
        return Option.some<ReadonlySet<string>>(
          new Set([
            name,
            ...agents.flatMap((agent) => {
              const compiled = compileSubagentImplementation({
                package: pkg.value,
                agentId: agent.id,
              });
              return compiled._tag === "Compiled" ? [compiled.nativeName] : [];
            }),
          ]),
        );
      });
    /**
     * Stems of recorded Subagent files that no declared Subagent names, by its
     * own or a native name: what a renamed native output leaves behind. When
     * any declared package cannot be read, nothing is treated as orphaned.
     */
    const orphanStems = (
      authority: AgentOutputAuthority,
      rows: ReadonlyMap<ProjectionUnitPath, RecordedProjectionRow>,
    ) =>
      Effect.gen(function* () {
        // A declared name always claims its own stem; packages are read only
        // when some recorded stem is not a declared name.
        const stems = new Set(
          [...rows.keys()]
            .map((unit) => extensionNameFromFilename(path.basename(unit)))
            .filter((stem) => !authority.expectedSubagentNames.has(stem)),
        );
        if (stems.size === 0) return stems;
        const claimed = new Set<string>();
        for (const name of authority.expectedSubagentNames) {
          const names = yield* acceptedNames(name);
          if (Option.isNone(names)) return new Set<string>();
          for (const claim of names.value) claimed.add(claim);
        }
        return new Set([...stems].filter((stem) => !claimed.has(stem)));
      });
    /**
     * Withdraw this Subagent's recorded files outside `keep`, and recorded
     * files no declared Subagent names. Each passes the deletion guard, and its
     * row is withdrawn whether it is deleted or kept.
     * With `reportUnrecorded`, a same-named file AXM never recorded in a
     * configured agent's container is reported as retained.
     */
    const retireOutputs = (args: {
      readonly names: ReadonlySet<string>;
      readonly authority: AgentOutputAuthority;
      readonly keep: ReadonlySet<string>;
      readonly rows: ReadonlyMap<ProjectionUnitPath, RecordedProjectionRow>;
      readonly discardModified: boolean;
      readonly reportUnrecorded: boolean;
    }) =>
      Effect.gen(function* () {
        const configuredAgentIds = new Set(yield* settings.configuredAgents);
        const orphans = yield* orphanStems(args.authority, args.rows);
        const outputs = (yield* observeNamed(
          new Set([...args.names, ...orphans]),
          args.authority,
        )).filter((output) => !args.keep.has(output.path));
        const recordedOutputs: Array<{
          readonly output: AgentOutputObservation;
          readonly unit: ProjectionUnitPath;
          readonly recorded: RecordedProjectionRow;
        }> = [];
        const unrecorded: Array<AgentOutputObservation> = [];
        for (const output of outputs) {
          const unit = subagentUnitPath(path, baseDir, output.path);
          const recorded = Option.flatMap(unit, (key) =>
            Option.fromUndefinedOr(args.rows.get(key)),
          );
          if (Option.isSome(unit) && Option.isSome(recorded))
            recordedOutputs.push({ output, unit: unit.value, recorded: recorded.value });
          else if (
            args.reportUnrecorded &&
            args.names.has(output.entryName) &&
            output.claimantAgentIds.some((agentId) => configuredAgentIds.has(agentId))
          )
            unrecorded.push(output);
        }
        const before = yield* nativeArtifactLocationOutcomes({
          workspaceRoot: baseDir,
          scope: location.scope,
          agents: yield* agentRepo.all,
          configuredAgentIds,
          sharedSkillPolicy: false,
          targets: [...recordedOutputs.map(({ output }) => output), ...unrecorded].map(
            (output) => ({
              path: output.path,
              kind: "subagent" as const,
              state: "unchanged" as const,
            }),
          ),
        });
        const withdrawn: Array<AgentOutputObservation> = [];
        const retained = new Map<string, string>(
          unrecorded.map((output) => [
            output.path,
            retainedOutputDetail(output.path, "unrecorded"),
          ]),
        );
        const rowChanges: Array<ProjectionRowChange> = [];
        for (const { output, unit, recorded } of recordedOutputs) {
          const result = yield* removeSubagentFiles({
            nativeRoots,
            workspaceRoot: baseDir,
            scope: location.scope,
            subagentName: output.entryName,
            renderedFilePaths: [path.relative(baseDir, output.path)],
            decideRemoval: ({ filePath, bytes }) => {
              const decision = decideOutputDeletion({
                bytes: Option.some(bytes),
                recorded: Option.some(recorded),
                expectedRender: Option.none(),
                discardModified: args.discardModified,
              });
              return decision._tag === "delete"
                ? decision
                : { _tag: "retain", reason: retainedOutputDetail(filePath, decision.reason) };
            },
          });
          rowChanges.push({ kind: "subagents", path: unit, row: undefined });
          if (result._tag !== "success") continue;
          if (result.renderedFilePaths.length > 0) withdrawn.push(output);
          for (const kept of result.retained ?? []) retained.set(output.path, kept.reason);
        }
        const nativeLocations = (yield* retiredNativeArtifactLocationOutcomes(before)).map(
          (unit): NativeLocationOutcome => {
            const reason =
              retained.get(unit.address.path) ??
              unit.aliases.map((alias) => retained.get(alias)).find((found) => found !== undefined);
            if (reason === undefined || unit.state !== "retained") return unit;
            return { ...unit, ownership: "unowned", state: "retained", reason };
          },
        );
        return { outputs: withdrawn, nativeLocations, rowChanges };
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SubagentIoFailed({ detail: "Cannot retire obsolete Subagent outputs", cause }),
        ),
      );
    const stageRows = (changes: ReadonlyArray<ProjectionRowChange>) =>
      changes.length === 0 ? Effect.void : accepted.withBatch(accepted.stageProjections(changes));
    /**
     * Refuse before any write when a planned destination holds a file AXM has
     * no record of writing and whose bytes differ from the render.
     */
    const preflight = (
      ref: SubagentExtensionRef,
      pkg: DecodedSubagentPackage,
      configuredAgents?: ReadonlyArray<string>,
      replaceUnrecorded = false,
    ) =>
      Effect.gen(function* () {
        const rows = yield* subagentRows;
        const targets = yield* preparedTargets(ref, pkg, configuredAgents);
        for (const target of targets)
          if (target.directory._tag === "misconfigured")
            return yield* new SubagentDefinitionInvalid({ detail: target.directory.reason });
        const planned = yield* plannedFiles(ref, targets);
        for (const destination of planned.keys()) {
          const decision = decideAt({
            planned,
            rows,
            destination,
            bytes: yield* fs.readFileString(destination).pipe(Effect.option),
            replaceUnrecorded,
          });
          if (decision._tag === "conflict")
            return yield* new SubagentNativeConflict({ detail: decision.reason });
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
        const validate = (root: string) =>
          Effect.gen(function* () {
            const pkg = yield* readPackage(root);
            if (project) yield* preflight(ref, pkg);
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
        const treeIntegrity = yield* materializeCanonical(
          ref,
          force === true,
          nativeInsertionEligible === true,
          true,
        );
        const pkg = yield* readPackage(canonicalPath);
        const targets = yield* preparedTargets(ref, pkg);
        const rows = yield* subagentRows;
        const planned = yield* plannedFiles(ref, targets);
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
                      decideWrite: ({ filePath, prior }) =>
                        decideAt({
                          planned,
                          rows,
                          destination: filePath,
                          bytes: prior,
                          replaceUnrecorded: false,
                        }),
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
        const written = successful.flatMap(({ outcome }) =>
          (outcome.nativeTargets ?? []).flatMap((target): ReadonlyArray<ProjectionRowChange> => {
            const file = planned.get(target.path);
            return file === undefined ||
              target.decision === undefined ||
              target.decision === "current"
              ? []
              : [
                  {
                    kind: "subagents",
                    path: file.unit,
                    row: { gen: file.gen, output: projectionOutputDigest(file.content) },
                  },
                ];
          }),
        );
        const retired = yield* retireOutputs({
          names: nativeNames(ref, targets),
          authority,
          keep,
          rows,
          discardModified: false,
          reportUnrecorded: false,
        });
        yield* stageRows([...retired.rowChanges, ...written]);
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
        const authority = yield* captureAgentOutputAuthority();
        const retired = yield* retireOutputs({
          names: Option.getOrElse(yield* acceptedNames(target.name), () => new Set([target.name])),
          authority,
          keep: new Set(),
          rows: yield* subagentRows,
          discardModified: false,
          reportUnrecorded: true,
        });
        yield* stageRows(retired.rowChanges);
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
        yield* preflight(ref, pkg, options?.configuredAgents);
        const targets = yield* preparedTargets(ref, pkg, options?.configuredAgents);
        const rows = yield* subagentRows;
        const planned = yield* plannedFiles(ref, targets);
        const allAgents = yield* agentRepo.all;
        const observations = [];
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
            const planFile = planned.get(address.referentPath ?? address.entryPath);
            const present = yield* fs.exists(file).pipe(
              Effect.mapError(
                (cause) =>
                  new SubagentDefinitionInvalid({
                    detail: `Cannot inspect planned Subagent file ${file}`,
                    cause,
                  }),
              ),
            );
            // A declared Subagent owns its planned path; currency is the
            // recorded generation, never the file's bytes.
            const current =
              planFile !== undefined &&
              projectionIsCurrent(
                Option.fromUndefinedOr(rows.get(planFile.unit)),
                planFile.gen,
                present,
              );
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
                  state: current ? "unchanged" : present ? "updated" : "created",
                },
              ],
            });
            observations.push({
              present,
              current,
              nativeLocations: nativeLocations.map((unit) => {
                const { proof: _proof, ...facts } = unit;
                return present
                  ? { ...facts, ownership: "owned" as const, proof: "declared-native-path" }
                  : { ...facts, ownership: "absent" as const };
              }),
            });
          }
        }
        // A recorded file of this Subagent outside the plan is withdrawn on the
        // next write, so the projection is not current until it is gone.
        const observedAuthority = yield* captureAgentOutputAuthority();
        const obsolete = (yield* observeNamed(
          new Set([...nativeNames(ref, targets), ...(yield* orphanStems(observedAuthority, rows))]),
          observedAuthority,
        )).some((output) => {
          const unit = subagentUnitPath(path, baseDir, output.path);
          return (
            !planned.has(output.path) && Option.isSome(unit) && rows.get(unit.value) !== undefined
          );
        });
        // What a reconciliation would write, judged by the same decision the
        // install applies, so the preview flags a replaced hand edit. A current
        // row decides without reading the file's bytes.
        const writes: Array<JobStepArtifactTarget> = [];
        for (const [destination, file] of planned) {
          const recorded = Option.fromUndefinedOr(rows.get(file.unit));
          if (
            Option.isSome(recorded) &&
            projectionIsCurrent(
              recorded,
              file.gen,
              yield* fs.exists(destination).pipe(
                Effect.mapError(
                  (cause) =>
                    new SubagentDefinitionInvalid({
                      detail: `Cannot inspect planned Subagent file ${destination}`,
                      cause,
                    }),
                ),
              ),
            )
          )
            continue;
          const decision = decideWholeFileWrite({
            recorded,
            gen: file.gen,
            bytes: yield* fs.readFileString(destination).pipe(Effect.option),
            rendered: file.content,
            replaceUnrecorded: false,
          });
          if (decision._tag !== "write") continue;
          writes.push({
            path: path.relative(baseDir, destination),
            change: decision.lastWrite === "absent" ? "created" : "updated",
            ...(decision.lastWrite === "absent" ? {} : { lastWrite: decision.lastWrite }),
          });
        }
        return {
          present: observations.every((item) => item.present),
          current: !obsolete && observations.every((item) => item.current),
          nativeLocations: combineNativeLocationOutcomes(
            observations.flatMap((item) => item.nativeLocations),
          ),
          agentOutcomes: targets.map((target) => outcomeForTarget(ref, target, "current")),
          ...(writes.length === 0
            ? {}
            : { targets: writes.sort((left, right) => left.path.localeCompare(right.path)) }),
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
    } satisfies SubagentManagerService;
  }),
);
