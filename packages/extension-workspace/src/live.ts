/**
 * @agentxm/extension-workspace environment-backed composition.
 *
 * The registry-backed coding-agent repository layer. Only application
 * composition roots import this module; feature logic resolves
 * `CodingAgentRepository` from its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { CodingAgentRepositoryLive } from "./extension-workspace/repository.js";
