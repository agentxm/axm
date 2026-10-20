import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { resolveNativeEntry, resolveNativeReferent } from "@agentxm/workspace-kernel/locations";
import { resolveUserHome } from "@agentxm/workspace-kernel/workspace-state";
import {
  CodingAgentRepository,
  classifyNativeOutputHealth,
  classifyNativeOutputCollisions,
  type AgentOutputObservation,
  type NativeOutputConcern,
} from "@agentxm/workspace-kernel/projection";
import { setupSkillTargets } from "./skill-targets.js";
import { configurationRefused } from "../errors.js";

/** Read only the proposed native skill entries and same-name user readers. */
export const observeSetupOutputConcerns = (
  root: string,
  scope: WorkspaceScope,
  agentIds: ReadonlyArray<string>,
  targets?: Effect.Success<ReturnType<typeof setupSkillTargets>>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const repository = yield* CodingAgentRepository;
    const selectedTargets = targets ?? (yield* setupSkillTargets(root, scope, agentIds));
    const proposedTargets: ReadonlyArray<AgentOutputObservation> = selectedTargets.flatMap(
      (target) =>
        "agentIds" in target && target.agentIds !== undefined
          ? [
              {
                path: target.path,
                containerPath: path.dirname(target.path),
                entryName: "axm",
                extensionType: "skill" as const,
                claimantAgentIds: target.agentIds,
                ownership: "unowned" as const,
                desired: true,
              },
            ]
          : [],
    );
    const projectReaders = new Map<string, Array<string>>();
    for (const id of agentIds.filter(isConfigurableAgentId)) {
      const agent = yield* repository.get(id);
      for (const location of yield* agent.resolveNativeReadLocations({
        workspaceRoot: root,
        scope,
        kind: "skill",
      })) {
        const resolved = yield* resolveNativeReferent(location.path).pipe(Effect.result);
        const directory = Result.isSuccess(resolved) ? resolved.success : location.path;
        projectReaders.set(directory, [...(projectReaders.get(directory) ?? []), id]);
      }
    }
    const proposed = proposedTargets.map((output) => ({
      ...output,
      claimantAgentIds: [
        ...new Set([
          ...output.claimantAgentIds,
          ...(projectReaders.get(output.containerPath) ?? []),
        ]),
      ].sort(),
    }));
    const user: Array<AgentOutputObservation> = [];
    if (scope === "project") {
      const home = yield* resolveUserHome();
      for (const id of agentIds.filter(isConfigurableAgentId)) {
        const agent = yield* repository.get(id);
        for (const location of yield* agent.resolveNativeReadLocations({
          workspaceRoot: home,
          scope: "user",
          kind: "skill",
        })) {
          user.push({
            path: path.join(location.path, "axm"),
            containerPath: location.path,
            entryName: "axm",
            extensionType: "skill",
            claimantAgentIds: [id],
            ownership: "unowned",
            desired: false,
          });
        }
      }
    }
    const observed = yield* Effect.forEach([...proposed, ...user], (output) =>
      Effect.gen(function* () {
        return {
          ...output,
          nativeEntry: yield* resolveNativeEntry(output.path).pipe(Effect.result),
        };
      }),
    );
    const userPaths = new Set(user.map((entry) => entry.path));
    const canonical = selectedTargets.find((target) => !("agentIds" in target));
    const proposedPaths = new Set(proposed.map((entry) => entry.path));
    // Publishing the bundled source repairs these exact source links as part of
    // the existing plan; it does not authorize removal of any foreign link.
    const plannedSourceRepairs = new Set(
      observed.flatMap((entry) => {
        if (
          canonical === undefined ||
          !proposedPaths.has(entry.path) ||
          Result.isFailure(entry.nativeEntry)
        )
          return [];
        const native = entry.nativeEntry.success;
        return native.kind === "symlink" &&
          native.referentPath === undefined &&
          native.linkTarget !== undefined &&
          path.resolve(path.dirname(native.entryPath), native.linkTarget) ===
            path.join(canonical.path, "src")
          ? [native.entryPath]
          : [];
      }),
    );
    return [
      ...classifyNativeOutputHealth(observed).filter(
        (concern) => !plannedSourceRepairs.has(concern.path),
      ),
      ...classifyNativeOutputCollisions(
        proposed,
        observed.filter((entry) => userPaths.has(entry.path)),
        new Set(agentIds),
      ),
    ];
  }).pipe(
    Effect.mapError((cause) =>
      configurationRefused({
        category: "internal",
        detail: "Failed to inspect setup's native outputs",
        cause,
      }),
    ),
  );

export const setupOutputConcernMessage = (concern: NativeOutputConcern): string => {
  switch (concern.kind) {
    case "broken-link":
      return `Link target '${concern.target}' is missing.`;
    case "unreadable":
      return `Entry could not be inspected (${concern.reason}).`;
    case "collision":
      return `Same-named ${concern.extensionType} at ${concern.otherPath} is also read by ${concern.agentIds.join(", ")}.`;
  }
};
