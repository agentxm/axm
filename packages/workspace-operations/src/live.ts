/**
 * @agentxm/workspace-operations environment-backed composition.
 *
 * The composed workspace layer every entry point provides. Only application
 * composition roots import this module; feature logic keeps
 * `WorkspaceMutations` in its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  layer,
  loadWorkspace,
  makeWorkspaceTransactionCapabilities,
} from "./operations/load-workspace.js";
export type { WorkspaceLayerOptions } from "@agentxm/workspace-state";
