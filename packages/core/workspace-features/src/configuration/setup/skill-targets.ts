/** The bundled skill occupies the same locations in confirmation and result. */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { inspectSkillAgentArtifact } from "@agentxm/extension-kinds/skills";
import { nativeAuthorityRoots, resolveNativeEntry } from "@agentxm/workspace-kernel/locations";
import {
  captureNativeDirectoryInputs,
  resolveUserHome,
} from "@agentxm/workspace-kernel/workspace-state";
import type { SetupPlanRow } from "./initialization-interaction.js";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { groupInstallTargetsByDirectory } from "@agentxm/workspace-kernel/materialization";
import { CodingAgentRepository } from "@agentxm/workspace-kernel/projection";
import {
  BUNDLED_SKILL_OWNER,
  acquiredDisplayPath,
} from "@agentxm/workspace-kernel/workspace-state";

export const setupSkillTargets = (
  root: string,
  scope: WorkspaceScope,
  agents: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const repository = yield* CodingAgentRepository;
    const targets = yield* Effect.forEach(agents.filter(isConfigurableAgentId), (id) =>
      Effect.gen(function* () {
        const agent = yield* repository.get(id);
        const resolved = yield* agent.resolveEffectiveSkillsDir({ workspaceRoot: root, scope });
        return resolved._tag === "supported" ? [{ targetDir: resolved.dir, agentId: id }] : [];
      }),
    );
    return [
      {
        path: path.resolve(
          root,
          acquiredDisplayPath(scope, `registry.agentxm.ai/${BUNDLED_SKILL_OWNER}/skills/axm`),
        ),
      },
      ...(yield* groupInstallTargetsByDirectory(targets.flat(), root)).map((target) => ({
        path: path.join(target.targetDir, "axm"),
        agentIds: target.agentIds,
      })),
    ];
  });

/** Plan native entries through the same admission check the bundled writer uses. */
export const setupSkillPlanRows = (
  root: string,
  scope: WorkspaceScope,
  targets: Effect.Success<ReturnType<typeof setupSkillTargets>>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const canonical = targets.find((target) => !("agentIds" in target));
    if (canonical === undefined) return [];
    const nativeRoots = nativeAuthorityRoots(
      path,
      { workspaceRoot: root, scope },
      yield* captureNativeDirectoryInputs(yield* resolveUserHome()),
    );
    return yield* Effect.forEach(targets, (target) =>
      Effect.gen(function* () {
        const entry = yield* resolveNativeEntry(target.path);
        const base = {
          target: path.relative(root, target.path),
          ...(!("agentIds" in target) || target.agentIds.length === 0
            ? {}
            : { agentIds: target.agentIds }),
        };
        if (!("agentIds" in target))
          return {
            ...base,
            action: entry.kind === "absent" ? "create" : "update",
            detail: { _tag: "bundledSkill" },
          } satisfies SetupPlanRow;
        const inspected = yield* inspectSkillAgentArtifact({
          canonicalSkillSrcPath: path.join(canonical.path, "src"),
          targetDir: path.dirname(target.path),
          sanitizedName: "axm",
          baseDir: root,
          nativeRoots,
          nativeInsertionEligible: true,
        }).pipe(Effect.result);
        if (inspected._tag === "Failure") {
          if (
            inspected.failure._tag === "NativeLocationError" &&
            inspected.failure.reason === "unreadable"
          )
            return yield* inspected.failure;
          return {
            ...base,
            action: "blocked",
            change: "unchanged",
            detail: {
              _tag: "bundledSkill",
              reason:
                inspected.failure._tag === "SkillMaterializationFailed"
                  ? inspected.failure.detail
                  : inspected.failure.reason,
            },
          } satisfies SetupPlanRow;
        }
        const currentLink = inspected.success.state === "current" && entry.kind === "symlink";
        return {
          ...base,
          action: currentLink ? "in sync" : entry.kind === "absent" ? "create" : "update",
          detail: {
            _tag: "bundledSkill",
            ...(entry.kind === "directory"
              ? { reason: "Reconcile the existing copy with the bundled source" }
              : {}),
          },
        } satisfies SetupPlanRow;
      }),
    );
  });
