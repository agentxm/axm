/**
 * What a materialization plan step declares at execution time.
 *
 * A manager keeps the platform, the registry transport, and the native-write
 * authority in `R`; a closure recipe adds the workspace transaction scope it
 * opens; a CLI-assembled step adds the workspace facade, the agent repository,
 * the screen it reports through, and the boundary's failure conversion. Those
 * requirements travel with the step through the plan and are composed once at
 * the application's own runtime boundary — nothing captures a service into a
 * step's closure on the way.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { StepFailureConversion } from "@agentxm/extension-lifecycle";
import type { ManagerRequirements, RecipeRequirements } from "@agentxm/extension-materialization";
import type { CodingAgentRepository } from "@agentxm/workspace-projection";
import type { WorkspaceMutations } from "@agentxm/workspace-state";
import type { Screen } from "../../screen/index.js";

export type StepRequirements =
  | ManagerRequirements
  | RecipeRequirements
  | CodingAgentRepository
  | WorkspaceMutations
  | StepFailureConversion
  | Screen;
