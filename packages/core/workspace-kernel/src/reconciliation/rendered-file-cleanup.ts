// @effect-diagnostics nodeBuiltinImport:off — FileSystem.remove uses rm; unlink removes an owned directory link without traversing its source
import { unlink } from "node:fs/promises";

/**
 * Destructive reconciliation of AXM-owned agent-native outputs. Read-only
 * ownership and claimant discovery lives in `@agentxm/workspace-kernel/projection`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  combineNativeLocationOutcomes,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
  retireCopiedDirectory,
  type NativeLocationOutcome,
} from "../locations/index.js";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
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
  type AgentOutputInventory,
  type AgentOutputObservation,
} from "../projection/index.js";
import { NativeWriteAuthority } from "../agent-adapters/index.js";
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
      output.extensionType === "skill" ? "skill-parent-directories" : "subagent-parent-directories";
    yield* (yield* NativeWriteAuthority).retireCreatedDirectories({
      path: address.entryPath,
      unit: JSON.stringify([unit, address.entryPath]),
    });
  }).pipe(
    Effect.mapError((error) =>
      cleanupFailure(`Failed to remove managed agent artifact: ${output.path}`, error),
    ),
  );

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
    const location = yield* WorkspaceLocation;
    const selected = (output: AgentOutputObservation) =>
      args.subjects === undefined ||
      args.subjects.some(
        (subject) =>
          subject.type === output.extensionType &&
          subject.name === (output.extensionName ?? output.entryName),
      );
    const candidates = before.ownedResidue.filter(
      (output) =>
        selected(output) &&
        output.extensionType !== "mcp-server" &&
        output.extensionType !== "hook",
    );
    const retainedNative = before.outputs.filter(
      (output) =>
        selected(output) &&
        (output.extensionType === "mcp-server" || output.extensionType === "hook"),
    );
    const nativeRetentions = retainedNative.flatMap(
      (output): ReadonlyArray<NativeLocationOutcome> =>
        output.nativeAddress === undefined
          ? []
          : [
              {
                scope: location.scope,
                address: output.nativeAddress,
                aliases: [output.containerPath],
                configuredConsumers: output.claimantAgentIds.filter((agentId) =>
                  args.desiredAgentIds.has(agentId),
                ),
                potentialReaders: output.claimantAgentIds.filter(
                  (agentId) => !args.desiredAgentIds.has(agentId),
                ),
                policyReasons: [],
                ownership: output.ownership,
                ...(output.proof === undefined ? {} : { proof: output.proof }),
                state: "retained",
                mechanism: "structured-entry",
                availability: [],
                reason:
                  "Native registrations remain in place; absence from declarations or agent membership does not authorize cleanup or stop execution.",
              },
            ],
    );
    const preservedPaths = [
      ...new Set([...before.unownedFootprints, ...retainedNative].map(({ path }) => path)),
    ].sort();
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agents = yield* (yield* CodingAgentRepository).all;
    const observedArtifacts = yield* Effect.forEach(
      ["skill", "subagent"] as const,
      (extensionType) =>
        Effect.gen(function* () {
          const outputs = before.outputs.filter(
            (output) => output.extensionType === extensionType && selected(output),
          );
          const facts = yield* nativeArtifactLocationOutcomes({
            workspaceRoot: location.baseDir,
            scope: location.scope,
            agents,
            configuredAgentIds: args.desiredAgentIds,
            sharedSkillPolicy: extensionType === "skill",
            targets: outputs.map((output) => ({
              path: output.path,
              kind: output.proof === "copied-directory-receipt" ? "skill" : extensionType,
              state: candidates.includes(output) ? "removed" : "retained",
            })),
          });
          return facts.map((fact): NativeLocationOutcome => {
            const output = outputs.find(
              (output) => output.path === fact.address.path || fact.aliases.includes(output.path),
            );
            if (output?.ownership === "unowned") {
              const { proof: _proof, ...rest } = fact;
              return {
                ...rest,
                ownership: "unowned",
                state: "retained",
                reason: "Ownership is not established; the native entry is preserved.",
              };
            }
            if (fact.state !== "retained") return fact;
            return {
              ...fact,
              reason:
                fact.configuredConsumers.length > 0
                  ? `Still required by configured consumers: ${fact.configuredConsumers.join(", ")}.`
                  : fact.policyReasons.length > 0
                    ? "Still required by AXM's shared skills policy; no configured agents read this location."
                    : "The native entry remains desired.",
            };
          });
        }),
    ).pipe(
      Effect.mapError((cause) =>
        cleanupFailure("Cannot observe native artifact reconciliation", cause),
      ),
    );
    const retainedLocations = [
      ...nativeRetentions,
      ...observedArtifacts.flat().filter((unit) => unit.state === "retained"),
    ];
    if (args.dryRun === true) {
      return {
        removedPaths: [...new Set(candidates.map(({ path }) => path))].sort(),
        preservedPaths,
        nativeLocations: combineNativeLocationOutcomes([
          ...nativeRetentions,
          ...observedArtifacts.flat(),
        ]),
      };
    }
    const nativeLocations: NativeLocationOutcome[] = [...retainedLocations];
    const artifactBefore = observedArtifacts.map((locations) =>
      locations.filter((unit) => unit.state === "removed"),
    );
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
    nativeLocations.push(
      ...(yield* retiredNativeArtifactLocationOutcomes(artifactBefore.flat()).pipe(
        Effect.mapError((cause) =>
          cleanupFailure("Cannot observe withdrawn native artifacts", cause),
        ),
      )),
    );
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
    for (const retired of candidates) {
      if (
        after.outputs.some(
          (output) =>
            output.extensionType === retired.extensionType &&
            output.path === retired.path &&
            output.entryName === retired.entryName &&
            output.ownership === "owned" &&
            !output.desired,
        )
      ) {
        return yield* cleanupFailure(
          `Owned native output remains after retirement: ${retired.path}`,
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
