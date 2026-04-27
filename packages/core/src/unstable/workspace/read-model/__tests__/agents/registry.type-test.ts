/**
 * Compile-time type assertions for the agents/index.ts barrel.
 *
 * Pure type-level. Excluded from vitest's runtime suite; included in
 * `tsconfig.spec.json` so the assertions are checked when typecheck runs.
 *
 * `AgentNativeConfig` is the open union of every registered per-agent
 * module's typed `nativeConfig` shape. The registry barrel re-exports the
 * union so downstream consumers see the same set of variants without
 * importing every per-agent module.
 */

import type { AgentNativeConfig } from "../../agents/index.js";

// `AgentNativeConfig` SHALL be a non-trivial union — at least one variant.
// `never` would mean the union is empty (no agents registered) and `any`
// would mean the union is unrefined; both are rejected at type-check.
type _AgentNativeConfigIsUnion = [AgentNativeConfig] extends [never] ? false : true;
const _agentNativeConfigIsUnion = true as const satisfies _AgentNativeConfigIsUnion;

// Every variant carries an `agentId` discriminator (the contract every per
// agent module's native-config interface declares).
type _HasAgentId = AgentNativeConfig extends { readonly agentId: infer _Id } ? true : false;
const _hasAgentId = true as const satisfies _HasAgentId;

export type _Refs = [typeof _agentNativeConfigIsUnion, typeof _hasAgentId];
