/**
 * @agentxm/agent-integration environment-backed composition.
 *
 * The PATH-probing executable resolver layer. Only application composition
 * roots import this module; feature logic resolves `AgentExecutableResolver`
 * from its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { AgentExecutableResolverLive } from "./detection.js";
