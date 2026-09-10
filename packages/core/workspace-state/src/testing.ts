/**
 * @agentxm/workspace-state deterministic test layers and fixtures.
 *
 * In-memory and fixture-backed implementations of this package's own
 * services for tests and executable specifications. Production source never
 * imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export * from "./workspace/test-stubs.js";
export {
  WorkspaceReadModelTest,
  type WorkspaceReadModelTestOptions,
} from "./workspace/read-model/__fixtures__/test-layer.js";
export * from "./workspace/read-model/__fixtures__/builder.js";
export * from "./workspace/read-model/__fixtures__/decoders.js";
export * from "./workspace/read-model/__fixtures__/occurrences.js";
export * from "./workspace/read-model/__fixtures__/scenario-harness.js";
