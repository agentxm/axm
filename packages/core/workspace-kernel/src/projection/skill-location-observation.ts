/** Skill inventory currency follows exact native entry ownership and canonical content. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  copiedDirectoryIsCurrent,
  nativeUnitKey,
  readCopiedDirectory,
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeLocationOutcome,
} from "../locations/index.js";
import {
  WorkspaceLocation,
  type ConfiguredAgentOutcomesRequest,
  type ConfiguredExtensionObservation,
} from "../workspace-state/index.js";
import type { ConfiguredAgentOutcome } from "../operations/index.js";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import { captureAgentOutputAuthority } from "./output-authority.js";
import { nativeArtifactLocationOutcomes } from "./native-artifact-locations.js";

export const observeConfiguredSkillLocations = (request: ConfiguredAgentOutcomesRequest) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const agents = yield* (yield* CodingAgentRepository).all;
    const authority = yield* captureAgentOutputAuthority();
    const readers = (yield* Effect.forEach(agents, (agent) =>
      agent
        .resolveNativeReadLocations({
          workspaceRoot: location.baseDir,
          scope: location.scope,
          kind: "skill",
        })
        .pipe(
          Effect.map((locations) => locations.map((reader) => ({ agentId: agent.id, ...reader }))),
        ),
    )).flat();
    const results = new Map<string, ConfiguredExtensionObservation>();
    for (const row of request.rows) {
      const sources = yield* Effect.forEach(
        authority.expectedSkillSources[row.name] ?? [],
        resolveNativeReferent,
      );
      const targets = new Set(
        row.targetState === "absent"
          ? []
          : [path.join(location.baseDir, ".agents/skills", row.name)],
      );
      for (const reader of readers) {
        const target = path.join(reader.path, row.name);
        const address = yield* resolveNativeEntry(target);
        if (
          (address.kind !== "absent" &&
            (address.kind === "symlink" || (yield* fs.exists(path.join(target, "SKILL.md"))))) ||
          (row.targetState !== "absent" &&
            request.agentIds.includes(reader.agentId) &&
            reader.declaration.role === "primary")
        )
          targets.add(target);
      }
      const proposed = yield* nativeArtifactLocationOutcomes({
        workspaceRoot: location.baseDir,
        scope: location.scope,
        agents,
        configuredAgentIds: new Set(request.agentIds),
        sharedSkillPolicy: row.targetState === "enabled",
        targets: [...targets].map((target) => ({
          path: target,
          kind: "skill" as const,
          state: "unverified" as const,
        })),
      });
      const nativeLocations = yield* Effect.forEach(proposed, (fact) =>
        Effect.gen(function* () {
          const address = yield* resolveNativeEntry(fact.address.path);
          let owned = sources.includes(address.entryPath);
          let current = owned && (yield* fs.exists(path.join(address.entryPath, "SKILL.md")));
          if (address.kind === "symlink" && address.linkTarget !== undefined) {
            const immediate = yield* resolveNativeEntry(
              path.resolve(path.dirname(address.entryPath), address.linkTarget),
            );
            owned = immediate.kind !== "symlink" && sources.includes(immediate.entryPath);
            current = owned && (yield* fs.exists(path.join(immediate.entryPath, "SKILL.md")));
          } else if (address.kind === "directory" && !owned) {
            const receipt = yield* readCopiedDirectory(address.entryPath);
            owned = Option.isSome(receipt) && sources.includes(receipt.value.source);
            current =
              owned &&
              Option.isSome(receipt) &&
              (yield* copiedDirectoryIsCurrent(address.entryPath, receipt.value.source));
          }
          const { proof: _proof, ...facts } = fact;
          return {
            ...facts,
            ownership: address.kind === "absent" ? "absent" : owned ? "owned" : "unowned",
            state: address.kind === "absent" ? "absent" : current ? "unchanged" : "blocked",
            ...(owned
              ? {
                  proof:
                    address.kind === "symlink"
                      ? "exact-canonical-source-link"
                      : sources.includes(address.entryPath)
                        ? "canonical-source-coincidence"
                        : "bounded-copy-receipt",
                }
              : {}),
            ...(!current && address.kind !== "absent"
              ? {
                  reason: owned
                    ? "The owned copy differs from its canonical source."
                    : "This native entry is not owned by the configured Skill.",
                }
              : {}),
          } satisfies NativeLocationOutcome;
        }),
      );
      const agentOutcomes = request.agentIds.map((agentId): ConfiguredAgentOutcome => {
        const units = nativeLocations.filter((unit) => unit.configuredConsumers.includes(agentId));
        const blocked = units.some((unit) => unit.state === "blocked");
        const required = readers
          .filter((reader) => reader.agentId === agentId && reader.declaration.role === "primary")
          .map((reader) => path.join(reader.path, row.name));
        const missingRequired = units.some(
          (unit) =>
            unit.state === "absent" && unit.aliases.some((alias) => required.includes(alias)),
        );
        const current = !missingRequired && units.some((unit) => unit.state === "unchanged");
        return {
          extensionType: "skill",
          name: row.name,
          agentId,
          outcome: blocked
            ? "blocked"
            : current
              ? request.state
              : units.length === 0
                ? "blocked"
                : "failed",
          reasonCode: blocked
            ? "native-content-conflict"
            : current
              ? "verified-native-unit"
              : units.length === 0
                ? "native-location-unverified"
                : "projection-missing",
          reason: blocked
            ? "A declared native Skill entry is unowned or differs from the canonical source."
            : current
              ? "The declared native Skill entries match the canonical source; runtime selection is unverified."
              : units.length === 0
                ? "Native Skill availability is unverified: no concrete applicable location could be resolved for this agent and scope."
                : "A required native Skill entry is missing.",
          nativeUnitKeys: units.map(nativeUnitKey),
        };
      });
      results.set(row.name, { agentOutcomes, nativeLocations });
    }
    return results;
  });
