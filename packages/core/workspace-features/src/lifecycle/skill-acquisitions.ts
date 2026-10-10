/** Neutral acquisition facts derived only from committed, usable native output. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { sourceRefContentKey } from "@agentxm/workspace-kernel/acquisition";
import { nativeUnitKey } from "@agentxm/workspace-kernel/locations";
import type { OperationResolution, Plan } from "@agentxm/workspace-kernel/operations";
import { toStepKey } from "@agentxm/workspace-kernel/reconciliation";
import {
  acceptedLockedResolutionRef,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";

export interface SkillAcquisitionCandidate {
  readonly unitId: string;
  readonly memberId: string;
  readonly ref: SkillExtensionRef;
}

export interface InstalledSkill {
  readonly ref: SkillExtensionRef;
  readonly scope: "project" | "user";
  readonly installKind: "install" | "reinstall";
  readonly targetAgents: ReadonlyArray<string>;
}

/** Install observes fresh acceptance; reinstall observes every reacquired skill. */
export const collectSkillAcquisitions = <R>(plan: Plan<R>, freshOnly: boolean) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspace = yield* WorkspaceLocation;
    // Retained local packages are read at their canonical location. Freshness
    // follows the accepted source identity, rather than that temporary read path.
    const acceptanceKey = (ref: SkillExtensionRef) =>
      sourceRefContentKey(
        ref.refType === "local"
          ? { ...ref, location: path.resolve(workspace.baseDir, ref.sourcePath ?? ref.source.path) }
          : ref,
      );
    return yield* Effect.forEach(
      plan.jobs.flatMap((job) => job.steps),
      (step) =>
        Effect.gen(function* () {
          const skills = (step.acquisitionRefs ?? []).filter(
            (ref): ref is SkillExtensionRef => ref.type === "skill",
          );
          const retained = freshOnly
            ? yield* Effect.filter(skills, (ref) =>
                acceptedLockedResolutionRef({ type: "skill", name: ref.name }).pipe(
                  Effect.match({
                    onFailure: () => false,
                    onSuccess: (accepted) =>
                      Option.isNone(accepted) ||
                      (accepted.value.type === "skill" &&
                        acceptanceKey(accepted.value) !== acceptanceKey(ref)),
                  }),
                ),
              )
            : skills;
          return retained.map((ref): SkillAcquisitionCandidate => ({
            unitId: step.key ?? step.label,
            memberId: toStepKey({ type: "skill", name: ref.skill.name }),
            ref,
          }));
        }),
    ).pipe(Effect.map((groups) => groups.flat()));
  });

export const settledSkillAcquisitions = (
  candidates: ReadonlyArray<SkillAcquisitionCandidate>,
  resolution: OperationResolution,
  installKind: InstalledSkill["installKind"],
) =>
  Effect.gen(function* () {
    const installedSkills: InstalledSkill[] = [];
    const path = yield* Path.Path;
    const workspace = yield* WorkspaceLocation;
    if (resolution.mode === "apply" && resolution.interruption === undefined) {
      const seen = new Map<string, number>();
      for (const entry of candidates) {
        const unit = resolution.units.find(
          (unit) => unit.id === entry.unitId && unit.state === "committed",
        );
        if (unit?.artifact === undefined) continue;
        const member = unit.artifact.members?.find((member) => member.id === entry.memberId);
        const artifact =
          entry.unitId === entry.memberId
            ? unit.artifact
            : member?.changed === true
              ? member.artifact
              : undefined;
        if (artifact === undefined || artifact.change === "unchanged") continue;
        const finalLocations = (artifact.nativeLocations ?? []).map(
          (location) =>
            unit.artifact?.nativeLocations?.find(
              (final) => nativeUnitKey(final) === nativeUnitKey(location),
            ) ?? location,
        );
        const usable = finalLocations.filter(
          (location) =>
            location.ownership === "owned" &&
            ["created", "updated", "unchanged", "retained"].includes(location.state),
        );
        if (usable.length === 0) continue;
        const key = JSON.stringify([sourceRefContentKey(entry.ref), entry.ref.skill.name]);
        // A planned agent counts only when its exact native target is now usable.
        // Catalog potential readers do not prove an installation target.
        const targetAgents = (artifact.targets ?? []).flatMap((target) => {
          const targetPath = path.resolve(workspace.baseDir, target.path);
          return usable.some(
            (location) =>
              location.address.path === targetPath || location.aliases.includes(targetPath),
          )
            ? (target.agentIds ?? [])
            : [];
        });
        const previousIndex = seen.get(key);
        const previous = previousIndex === undefined ? undefined : installedSkills[previousIndex];
        if (previous !== undefined && previousIndex !== undefined) {
          installedSkills[previousIndex] = {
            ...previous,
            targetAgents: [...new Set([...previous.targetAgents, ...targetAgents])],
          };
        } else {
          seen.set(key, installedSkills.length);
          installedSkills.push({
            ref: entry.ref,
            scope: artifact.scope,
            installKind,
            targetAgents: [...new Set(targetAgents)],
          });
        }
      }
    }
    return installedSkills;
  });
