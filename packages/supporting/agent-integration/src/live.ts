/**
 * @agentxm/agent-integration environment-backed composition.
 *
 * The PATH-probing executable resolver and the detection-backed agent-presence
 * probe. Only application composition roots import this module; feature logic
 * resolves the services from its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { AgentExecutableResolverLive } from "./detection.js";
export { AgentPresenceProbeLive } from "./agent-presence.js";
