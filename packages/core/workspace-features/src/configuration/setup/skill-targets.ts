/** The bundled skill occupies the same locations in confirmation and result. */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
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
        ...(target.agentIds.length === 0 ? {} : { agentIds: target.agentIds }),
      })),
    ];
  });
