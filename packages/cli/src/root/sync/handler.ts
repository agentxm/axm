/**
 * Handler for `axm sync`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import { buildMaterializeOperation } from "@agentxm/client-core/unstable/extensions";
import { McpServerManager } from "@agentxm/client-core/unstable/mcp-servers";
import { ExtensionPackManager } from "@agentxm/client-core/unstable/packs";
import {
  applyPlan,
  resolvePlan,
  type Plan,
  type PlanResolution,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { displayPlan } from "@agentxm/client-core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";

export interface HandleSyncArgs {
  readonly dryRun: boolean;
}

const PLAN_NAME = "Sync workspace";
const PLAN_DESCRIPTION = "Materialize extensions from the axm lockfile";

const collectMaterializeSteps = Effect.fn("Sync.collectMaterializeSteps")(function* () {
  const skillManager = yield* SkillManager;
  const commandManager = yield* CommandManager;
  const mcpServerManager = yield* McpServerManager;
  const subagentManager = yield* SubagentManager;
  const packManager = yield* ExtensionPackManager;

  const [skillRefs, commandRefs, mcpServerRefs, subagentRefs, packRefs] = yield* Effect.all(
    [
      skillManager.listMaterializable(),
      commandManager.listMaterializable(),
      mcpServerManager.listMaterializable(),
      subagentManager.listMaterializable(),
      packManager.listMaterializable(),
    ],
    { concurrency: "unbounded" },
  );

  return [
    ...skillRefs.map((ref) => buildMaterializeOperation(skillManager, { ref })),
    ...commandRefs.map((ref) => buildMaterializeOperation(commandManager, { ref })),
    ...mcpServerRefs.map((ref) => buildMaterializeOperation(mcpServerManager, { ref })),
    ...subagentRefs.map((ref) => buildMaterializeOperation(subagentManager, { ref })),
    ...packRefs.map((ref) => buildMaterializeOperation(packManager, { ref })),
  ] satisfies ReadonlyArray<PlannedJobStep>;
});

const makeSyncPlan = (steps: ReadonlyArray<PlannedJobStep>): Plan =>
  resolvePlan({
    name: PLAN_NAME,
    description: PLAN_DESCRIPTION,
    steps,
    concurrency: "unbounded",
  });

const previewPlan = (plan: Plan): PlanResolution => ({
  _tag: "PreviewedPlan",
  name: plan.name,
  description: plan.description,
  jobs: plan.jobs,
});

export const handleSync = Effect.fn("Sync.handle")(function* (args: HandleSyncArgs) {
  const renderer = yield* CliRenderer;
  const steps = yield* collectMaterializeSteps();

  if (steps.length === 0) {
    if (
      yield* emitNoOpResult("sync", {
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
        message: "Nothing to materialize",
      })
    ) {
      return;
    }
    yield* renderer.success("Nothing to materialize");
    return;
  }

  const plan = makeSyncPlan(steps);

  if (args.dryRun) {
    yield* displayPlan(plan);
    yield* emitPlanResolutionResult("sync", previewPlan(plan));
    return;
  }

  const executed = yield* applyPlan(plan);
  yield* displayPlan(executed);
  yield* emitPlanResolutionResult("sync", executed);
});
