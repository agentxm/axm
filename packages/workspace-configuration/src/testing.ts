/**
 * Deterministic in-memory Layer implementations of the workspace-configuration
 * services. Tests and specifications may import this module; production
 * source composes the application's interaction implementation instead.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  WorkspaceInitializationInteractionTest,
  type WorkspaceInitializationInteractionTestState,
} from "./initialization-interaction.js";
