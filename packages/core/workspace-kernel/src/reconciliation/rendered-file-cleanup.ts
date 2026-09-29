// @effect-diagnostics nodeBuiltinImport:off — FileSystem.remove uses rm; unlink removes an owned directory link without traversing its source
import { unlink } from "node:fs/promises";

/**
 * Destructive reconciliation of AXM-owned agent-native outputs. Read-only
 * ownership and claimant discovery lives in `@agentxm/workspace-kernel/projection`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  readCopiedDirectory,
  resolveNativeReferent,
  combineNativeLocationOutcomes,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
  retireCopiedDirectory,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
} from "../locations/index.js";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  CodingAgentRepository,
  nativeArtifactLocationOutcomes,
  retiredNativeArtifactLocationOutcomes,
  observeAgentOutputs,
  captureAgentOutputAuthority,
  type AgentOutputAuthority,
  safeReadFileString,
  type AgentOutputInventory,
  type AgentOutputObservation,
} from "../projection/index.js";
import {
  NativeWriteAuthority,
  readManagedHookGroups,
  reconcileNativeHookConfig,
  pruneManagedMcpServersForAgents,
} from "../agent-adapters/index.js";
import type { NativeConfigReadLocation } from "@agentxm/extension-model/unstable/agent-capabilities";
import { AGENTS as CAPABILITY_AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import type { PerAgentType } from "@agentxm/extension-model/unstable/extensions/common";
import { DesiredStateReader, SettingsReader, WorkspaceLocation } from "../workspace-state/index.js";
import { protectWorkspacePath, recordFootprint, retireWorkspacePath } from "../settlement/index.js";
import { WorkspaceSyncFailed, type WorkspaceSyncCleanupFailure } from "./errors.js";

export interface ReconcileAgentOutputsResult {
  readonly removedPaths: ReadonlyArray<string>;
  readonly preservedPaths: ReadonlyArray<string>;
  readonly nativeLocations?: ReadonlyArray<NativeLocationOutcome>;
}

export interface ReconcileAgentOutputsArgs {
  readonly authority?: AgentOutputAuthority;
  readonly desiredAgentIds: ReadonlySet<string>;
  readonly expectedNames: Readonly<Record<PerAgentType, ReadonlySet<string>>>;
  readonly dryRun?: boolean;
  readonly subjects?: ReadonlyArray<{ readonly type: string; readonly name: string }>;
}

const inventory = (
  args: ReconcileAgentOutputsArgs,
): Effect.Effect<
  AgentOutputInventory,
  WorkspaceSyncFailed | Config.ConfigError,
  | CodingAgentRepository
  | FileSystem.FileSystem
  | Path.Path
  | SettingsReader
  | DesiredStateReader
  | WorkspaceLocation
  | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const authority =
      args.authority ??
      (yield* captureAgentOutputAuthority().pipe(
        Effect.mapError((cause) =>
          cleanupFailure("Cannot establish native output ownership", cause),
        ),
      ));
    return yield* observeAgentOutputs({
      workspaceRoot: location.baseDir,
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      scope: location.scope,
      desiredAgentIds: args.desiredAgentIds,
      expectedNames: args.expectedNames,
      authoredSkills: {
        layout,
        entries: yield* settings
          .entries("skill")
          .pipe(
            Effect.mapError((cause) =>
              cleanupFailure("Failed to read authored skill declarations", cause),
            ),
          ),
      },
      ...authority,
    });
  });

const cleanupFailure = (detail: string, cause: unknown) =>
  new WorkspaceSyncFailed({ category: "internal", detail, cause });

const removeOwnedFile = (
  fs: FileSystem.FileSystem,
  output: AgentOutputObservation,
  root: string,
  nativeRoots: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const { address } = yield* assertNativeMutationWithinRoots(
      nativeRoots,
      output.path,
      "entry",
      root,
    );
    yield* protectWorkspacePath(address.entryPath);
    if (output.proof === "copied-directory-receipt") {
      yield* retireCopiedDirectory(address.entryPath, retireWorkspacePath);
    } else {
      // Directory-wide markers cannot authorize removal of foreign children.
      if (address.kind === "directory") return;
      if (address.kind === "symlink") yield* Effect.tryPromise(() => unlink(address.entryPath));
      else yield* fs.remove(address.entryPath);
    }
    yield* recordFootprint({ path: address.entryPath, change: "removed" });
    const unit =
      output.extensionType === "skill"
        ? "skill-parent-directories"
        : output.proof === "copied-directory-receipt"
          ? "subagent-role-parent-directories"
          : "subagent-parent-directories";
    yield* (yield* NativeWriteAuthority).retireCreatedDirectories({
      path: address.entryPath,
      unit: JSON.stringify([unit, address.entryPath]),
    });
  }).pipe(
    Effect.mapError((error) =>
      cleanupFailure(`Failed to remove managed agent artifact: ${output.path}`, error),
    ),
  );

const uniqueContainers = (
  outputs: ReadonlyArray<AgentOutputObservation>,
): ReadonlyArray<AgentOutputObservation> =>
  outputs.filter(
    (output, index) =>
      outputs.findIndex(
        (candidate) =>
          candidate.extensionType === output.extensionType &&
          candidate.containerPath === output.containerPath,
      ) === index,
  );

const desiredNamesForContainer = (
  output: AgentOutputObservation,
  args: ReconcileAgentOutputsArgs,
): ReadonlySet<string> =>
  output.claimantAgentIds.some((agentId) => args.desiredAgentIds.has(agentId))
    ? args.expectedNames[output.extensionType]
    : new Set(
        [...args.expectedNames[output.extensionType]].filter(
          (name) =>
            args.subjects !== undefined &&
            !args.subjects.some(
              (subject) => subject.type === output.extensionType && subject.name === name,
            ),
        ),
      );

const pruneHookContainer = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  output: AgentOutputObservation,
  args: ReconcileAgentOutputsArgs & { readonly authority: AgentOutputAuthority },
  workspaceRoot: string,
  scope: "project" | "user",
  ownerRoot: string,
  inputs: NativeDirectoryInputs,
): Effect.Effect<
  ReadonlyArray<NativeLocationOutcome>,
  WorkspaceSyncCleanupFailure,
  NativeWriteAuthority | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const targets = [];
    const roots = nativeAuthorityRoots(path, { workspaceRoot, scope }, inputs);
    for (const agent of CAPABILITY_AGENTS) {
      if (!output.claimantAgentIds.includes(agent.id)) continue;
      const native = agent.capabilities.hook.native;
      if (!("locations" in native)) continue;
      const locations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
      for (const file of locations) {
        if (file.scope !== scope || (file.format !== "json" && file.format !== "jsonc")) continue;
        const settingsKey = file.keyPath?.[0];
        if (file.keyPath?.length !== 1 || settingsKey === undefined) continue;
        const declared = resolveNativeReadLocation(
          path,
          agent.id,
          file,
          { workspaceRoot, scope },
          inputs,
        );
        if (declared === undefined) continue;
        const alias = declared.path;
        const { address: resolved } = yield* assertNativeMutationWithinRoots(
          roots,
          alias,
          "content",
          ownerRoot,
        ).pipe(
          Effect.mapError((cause) => cleanupFailure("Cannot resolve hook cleanup location", cause)),
        );
        if ((resolved.referentPath ?? resolved.entryPath) === output.containerPath)
          targets.push({ agentId: agent.id, settingsKey, alias, format: file.format });
      }
    }
    const target = targets[0];
    if (target === undefined) return [];
    if (targets.some(({ settingsKey }) => settingsKey !== target.settingsKey))
      return yield* cleanupFailure(
        "Shared hooks configuration has incompatible ownership keys",
        output.containerPath,
      );
    const raw = yield* safeReadFileString(fs, output.containerPath);
    const desired = desiredNamesForContainer(output, args);
    const ownership = args.authority.expectedHooks;
    const rendered = yield* readManagedHookGroups(
      output.containerPath,
      target.settingsKey,
      raw,
      ownership.filter((owner) => desired.has(owner.name)),
    ).pipe(Effect.mapError((cause) => cleanupFailure("Cannot inspect owned hook entries", cause)));
    const result = yield* reconcileNativeHookConfig({
      workspaceRoot,
      nativeDirectoryInputs: inputs,
      ownerRoot,
      scope,
      path: output.containerPath,
      aliases: targets.map(({ alias }) => alias),
      consumers: output.claimantAgentIds.filter((id) => args.desiredAgentIds.has(id)),
      configuredAgentIds: [...args.desiredAgentIds],
      settingsKey: target.settingsKey,
      format: targets.some(({ format }) => format === "json") ? "json" : "jsonc",
      rendered,
      ownership,
      nativeInsertionEligibleNames: new Set(),
    }).pipe(Effect.mapError((cause) => cleanupFailure("Cannot retire owned hook entries", cause)));
    return [result.nativeLocation];
  });

/** Converge all AXM-owned per-agent outputs on desired workspace state. */
export const reconcileAgentOutputs = (
  args: ReconcileAgentOutputsArgs,
): Effect.Effect<
  ReconcileAgentOutputsResult,
  WorkspaceSyncCleanupFailure,
  | CodingAgentRepository
  | FileSystem.FileSystem
  | Path.Path
  | SettingsReader
  | DesiredStateReader
  | WorkspaceLocation
  | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const authority =
      args.authority ??
      (yield* captureAgentOutputAuthority().pipe(
        Effect.mapError((cause) =>
          cleanupFailure("Cannot establish native output ownership", cause),
        ),
      ));
    const authorizedArgs = { ...args, authority };
    const before = yield* inventory(authorizedArgs);
    const selected = (output: AgentOutputObservation) =>
      args.subjects === undefined ||
      args.subjects.some(
        (subject) => subject.type === output.extensionType && subject.name === output.entryName,
      );
    const candidates = before.ownedResidue.filter(selected);
    // Preserve every unselected entry in shared containers, including other residue.
    const scopedArgs =
      args.subjects === undefined
        ? authorizedArgs
        : {
            ...authorizedArgs,
            expectedNames: {
              skill: new Set([
                ...args.expectedNames.skill,
                ...before.outputs
                  .filter((output) => output.extensionType === "skill" && !selected(output))
                  .map((output) => output.entryName),
              ]),
              subagent: new Set([
                ...args.expectedNames.subagent,
                ...before.outputs
                  .filter((output) => output.extensionType === "subagent" && !selected(output))
                  .map((output) => output.entryName),
              ]),
              "mcp-server": new Set([
                ...args.expectedNames["mcp-server"],
                ...before.outputs
                  .filter((output) => output.extensionType === "mcp-server" && !selected(output))
                  .map((output) => output.entryName),
              ]),
              hook: new Set([
                ...args.expectedNames.hook,
                ...before.outputs
                  .filter((output) => output.extensionType === "hook" && !selected(output))
                  .map((output) => output.entryName),
              ]),
            },
          };
    const preservedPaths = [...new Set(before.unownedFootprints.map(({ path }) => path))].sort();
    if (args.dryRun === true) {
      return {
        removedPaths: [...new Set(candidates.map(({ path }) => path))].sort(),
        preservedPaths,
      };
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const nativeLocations: NativeLocationOutcome[] = [];
    const agents = yield* (yield* CodingAgentRepository).all;
    const artifactBefore = yield* Effect.forEach(["skill", "subagent"] as const, (extensionType) =>
      nativeArtifactLocationOutcomes({
        workspaceRoot: location.baseDir,
        scope: location.scope,
        agents,
        configuredAgentIds: args.desiredAgentIds,
        sharedSkillPolicy: extensionType === "skill",
        targets: candidates
          .filter((output) => output.extensionType === extensionType)
          .map((output) => ({
            path: output.path,
            kind: output.proof === "copied-directory-receipt" ? "skill" : extensionType,
            state: "unchanged",
          })),
      }),
    ).pipe(
      Effect.mapError((cause) =>
        cleanupFailure("Cannot observe native artifact withdrawal", cause),
      ),
    );
    const roleSources = yield* Effect.forEach(
      candidates.filter(
        (output) =>
          output.extensionType === "subagent" && output.proof === "copied-directory-receipt",
      ),
      (output) =>
        readCopiedDirectory(output.path).pipe(
          Effect.map((receipt) =>
            Option.isSome(receipt) ? { output, source: receipt.value.source } : undefined,
          ),
        ),
    );
    const mcpContainers = uniqueContainers(
      candidates.filter(({ extensionType }) => extensionType === "mcp-server"),
    );
    if (mcpContainers.length > 0) {
      const outcomes = yield* pruneManagedMcpServersForAgents(
        [...new Set(mcpContainers.flatMap((output) => output.claimantAgentIds))],
        {
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          workspaceRoot: location.baseDir,
          scope: location.scope,
          declaredServerNames: scopedArgs.expectedNames["mcp-server"],
          expectedManagedEntries: authority.expectedMcpEntries,
          configuredConsumerIds: args.desiredAgentIds,
          containerDesiredNames: new Map(
            mcpContainers.map((output) => [
              output.containerPath,
              desiredNamesForContainer(output, scopedArgs),
            ]),
          ),
        },
      ).pipe(
        Effect.mapError((error) =>
          cleanupFailure("Failed to reconcile managed MCP containers", error),
        ),
      );
      nativeLocations.push(
        ...outcomes.flatMap((outcome) =>
          "targets" in outcome
            ? (outcome.targets ?? []).flatMap((target) =>
                target.nativeLocation === undefined ? [] : [target.nativeLocation],
              )
            : [],
        ),
      );
    }
    for (const output of candidates) {
      if (output.extensionType === "skill" || output.extensionType === "subagent") {
        yield* removeOwnedFile(
          fs,
          output,
          location.baseDir,
          nativeAuthorityRoots(
            path,
            { workspaceRoot: location.baseDir, scope: location.scope },
            location.nativeDirectoryInputs,
          ),
        );
      }
    }
    for (const role of roleSources) {
      if (
        role === undefined ||
        before.outputs.some(
          (output) =>
            output.extensionType === "subagent" &&
            output.entryName === role.output.entryName &&
            !candidates.includes(output),
        )
      )
        continue;
      const remaining = yield* Effect.forEach(
        roleSources.filter((candidate) => candidate?.source === role.source),
        (candidate) =>
          candidate === undefined ? Effect.succeed(false) : fs.exists(candidate.output.path),
      ).pipe(
        Effect.mapError((cause) => cleanupFailure("Cannot inspect remaining role Skill", cause)),
      );
      if (remaining.some(Boolean)) continue;
      const generatedRoot = yield* resolveNativeReferent(
        path.join(location.baseDir, ".axm/build/polyfills/subagents", role.output.entryName),
      ).pipe(
        Effect.mapError((cause) => cleanupFailure("Cannot resolve generated role source", cause)),
      );
      if (!role.source.startsWith(`${generatedRoot}${path.sep}`)) continue;
      const file = path.join(role.source, "SKILL.md");
      const raw = yield* fs.readFileString(file).pipe(Effect.option);
      if (Option.isSome(raw))
        yield* (yield* NativeWriteAuthority)
          .retireInsertion({
            path: file,
            unit: JSON.stringify(["subagent-role-source", file]),
            raw: raw.value,
            empty: true,
          })
          .pipe(
            Effect.mapError((cause) =>
              cleanupFailure("Cannot retire generated role source", cause),
            ),
          );
    }
    nativeLocations.push(
      ...(yield* retiredNativeArtifactLocationOutcomes(artifactBefore.flat()).pipe(
        Effect.mapError((cause) =>
          cleanupFailure("Cannot observe withdrawn native artifacts", cause),
        ),
      )),
    );
    for (const output of uniqueContainers(
      candidates.filter(({ extensionType }) => extensionType === "hook"),
    )) {
      nativeLocations.push(
        ...(yield* pruneHookContainer(
          fs,
          path,
          output,
          scopedArgs,
          location.baseDir,
          location.scope,
          path.dirname(location.runtimeDir),
          location.nativeDirectoryInputs,
        )),
      );
    }

    const after = yield* inventory(authorizedArgs);
    // Membership changes must verify entries retained for remaining consumers,
    // including read-only additional paths, before publishing the transition.
    for (const retained of before.outputs.filter(
      (output) => output.desired && output.ownership === "owned",
    )) {
      if (
        !after.outputs.some(
          (output) =>
            output.extensionType === retained.extensionType &&
            output.path === retained.path &&
            output.entryName === retained.entryName &&
            output.ownership === "owned" &&
            output.desired,
        )
      ) {
        return yield* cleanupFailure(
          `Required native output disappeared during reconciliation: ${retained.path}`,
          undefined,
        );
      }
    }
    const remaining = new Set(
      after.outputs.map(
        (output) => `${output.extensionType}\u0000${output.path}\u0000${output.entryName}`,
      ),
    );
    const removedPaths = candidates
      .filter(
        (output) =>
          !remaining.has(`${output.extensionType}\u0000${output.path}\u0000${output.entryName}`),
      )
      .map(({ path: outputPath }) => outputPath);
    return {
      removedPaths: [...new Set(removedPaths)].sort(),
      preservedPaths,
      ...(nativeLocations.length === 0
        ? {}
        : { nativeLocations: combineNativeLocationOutcomes(nativeLocations) }),
    };
  });
