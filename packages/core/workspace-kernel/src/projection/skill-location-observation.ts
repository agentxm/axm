/** Skill inventory currency follows exact native entry ownership and canonical content. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  copiedDirectoryIsCurrent,
  nativeUnitReference,
  readCopiedDirectory,
  captureNativeLocationSet,
  type NativeLocationOutcome,
} from "../locations/index.js";
import {
  DesiredStateReader,
  readSkillDirectoryName,
  WorkspaceLocation,
  type ConfiguredAgentOutcomesRequest,
  type ConfiguredExtensionObservation,
} from "../workspace-state/index.js";
import type { ConfiguredAgentOutcome } from "../operations/index.js";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import { deriveSkillOutputSources } from "./output-authority.js";
import { nativeArtifactLocationOutcomes } from "./native-artifact-locations.js";

export const observeConfiguredSkillLocations = (request: ConfiguredAgentOutcomesRequest) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const agents = yield* (yield* CodingAgentRepository).all;
    const desired = request.readers?.desired ?? (yield* DesiredStateReader);
    const evaluation = yield* desired.evaluate();
    const sourcesByName = deriveSkillOutputSources(
      {
        path,
        layout: yield* Ref.get(location.layout),
        acceptedResolutions: evaluation.inputs.acceptedResolutions,
        desired: evaluation.graph,
        settings: evaluation.inputs.settings,
      },
      request.rows.length === 1 ? request.rows[0]?.name : undefined,
    );
    const namedRows = yield* Effect.forEach(request.rows, (row) =>
      Effect.gen(function* () {
        const source = sourcesByName[row.name]?.[0];
        return {
          ...row,
          directoryName:
            source === undefined ? row.name : yield* readSkillDirectoryName(source, row.name),
        };
      }),
    );
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
    const locations = yield* captureNativeLocationSet({
      entries: namedRows.flatMap((row) => [
        path.join(location.baseDir, ".agents/skills", row.directoryName),
        ...readers.map((reader) => path.join(reader.path, row.directoryName)),
      ]),
      referents: [
        path.join(location.baseDir, ".agents/skills"),
        ...readers.map((reader) => reader.path),
        ...request.rows.flatMap((row) => sourcesByName[row.name] ?? []),
      ],
    });
    const artifactReaders = readers.map(({ agentId, ...location }) => ({
      agentId,
      kind: "skill" as const,
      location,
    }));
    const results = new Map<string, ConfiguredExtensionObservation>();
    for (const row of namedRows) {
      const sources = yield* Effect.forEach(sourcesByName[row.name] ?? [], locations.referent);
      const targets = new Set(
        row.targetState === "absent"
          ? []
          : [path.join(location.baseDir, ".agents/skills", row.directoryName)],
      );
      for (const reader of readers) {
        const target = path.join(reader.path, row.directoryName);
        const address = yield* locations.entry(target);
        if (
          (address.kind !== "absent" &&
            (address.kind === "symlink" || (yield* fs.exists(path.join(target, "SKILL.md"))))) ||
          (row.targetState !== "absent" &&
            request.agentIds.includes(reader.agentId) &&
            reader.declaration.role === "primary")
        )
          targets.add(target);
      }
      const observedTargets = yield* Effect.forEach([...targets], (target) =>
        Effect.gen(function* () {
          const address = yield* locations.entry(target);
          let mechanism: NativeLocationOutcome["mechanism"] =
            address.kind === "symlink" ? "symlink" : undefined;
          let owned = sources.includes(address.entryPath);
          let current = owned && (yield* fs.exists(path.join(address.entryPath, "SKILL.md")));
          if (address.kind === "symlink" && address.linkTarget !== undefined) {
            const immediate = yield* locations.entry(
              path.resolve(path.dirname(address.entryPath), address.linkTarget),
            );
            owned = immediate.kind !== "symlink" && sources.includes(immediate.entryPath);
            current = owned && (yield* fs.exists(path.join(immediate.entryPath, "SKILL.md")));
          } else if (address.kind === "directory" && !owned) {
            const receipt = yield* readCopiedDirectory(address.entryPath);
            if (Option.isSome(receipt)) mechanism = "copied-directory";
            owned = Option.isSome(receipt) && sources.includes(receipt.value.source);
            current =
              owned &&
              Option.isSome(receipt) &&
              (yield* copiedDirectoryIsCurrent(address.entryPath, receipt.value.source));
          }
          return {
            path: target,
            kind: "skill" as const,
            state:
              address.kind === "absent"
                ? ("absent" as const)
                : current
                  ? ("unchanged" as const)
                  : ("blocked" as const),
            ownerObservation: {
              ownership: address.kind === "absent" ? "absent" : owned ? "owned" : "unowned",
              ...(mechanism === undefined ? {} : { mechanism }),
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
            } satisfies Pick<NativeLocationOutcome, "ownership" | "proof" | "mechanism" | "reason">,
          };
        }),
      );
      const nativeLocations = yield* nativeArtifactLocationOutcomes({
        workspaceRoot: location.baseDir,
        scope: location.scope,
        agents,
        configuredAgentIds: new Set(request.agentIds),
        sharedSkillPolicy: row.targetState === "enabled",
        readers: artifactReaders,
        locationSet: locations,
        targets: observedTargets,
      });
      const agentOutcomes = request.agentIds.map((agentId): ConfiguredAgentOutcome => {
        const units = nativeLocations.filter((unit) => unit.configuredConsumers.includes(agentId));
        const required = readers
          .filter((reader) => reader.agentId === agentId && reader.declaration.role === "primary")
          .map((reader) => path.join(reader.path, row.directoryName));
        const requiredUnit = (unit: NativeLocationOutcome) =>
          unit.policyReasons.includes("workspace-shared-skills") ||
          unit.aliases.some((alias) => required.includes(alias));
        const blocked = units.some(
          (unit) => unit.state === "blocked" && (unit.ownership === "owned" || requiredUnit(unit)),
        );
        const missingRequired = units.some((unit) => unit.state === "absent" && requiredUnit(unit));
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
            ? "A required native Skill entry is unowned, or an owned entry differs from the canonical source."
            : current
              ? "Required and owned native Skill entries match the canonical source; runtime selection is unverified."
              : units.length === 0
                ? "Native Skill availability is unverified: no concrete applicable location could be resolved for this agent and scope."
                : "A required native Skill entry is missing.",
          nativeUnits: units.map(nativeUnitReference),
        };
      });
      results.set(row.name, { agentOutcomes, nativeLocations });
    }
    return results;
  });
