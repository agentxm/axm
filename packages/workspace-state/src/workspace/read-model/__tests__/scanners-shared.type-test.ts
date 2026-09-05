/**
 * Compile-time type assertions for the scanner contract.
 *
 * Each public `make<Scanner>` function returns an
 * `Effect.Effect<…, never, never>` — no `FileSystem | Path` in `R`, no
 * tagged-error types in `E`. Excluded from vitest's runtime suite; included
 * in `tsconfig.spec.json` so the assertions are checked when typecheck runs.
 */

import type * as Effect from "effect/Effect";
import type { makeAgentDirScanner } from "../scanners/agent-dir.js";
import type { makeAgentSettingsScanner } from "../scanners/agent-settings.js";
import type { makeCanonicalExtensionsScanner } from "../scanners/canonical-extensions.js";
import type { makeMcpConfigScanner } from "../scanners/mcp-config.js";

type ScannerR<T> = T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

type _CanonicalNoR = [
  Exclude<ScannerR<ReturnType<typeof makeCanonicalExtensionsScanner>>, never>,
] extends [never]
  ? true
  : false;
const _canonicalNoR = true as const satisfies _CanonicalNoR;

type _AgentDirNoR = [Exclude<ScannerR<ReturnType<typeof makeAgentDirScanner>>, never>] extends [
  never,
]
  ? true
  : false;
const _agentDirNoR = true as const satisfies _AgentDirNoR;

type _McpNoR = [Exclude<ScannerR<ReturnType<typeof makeMcpConfigScanner>>, never>] extends [never]
  ? true
  : false;
const _mcpNoR = true as const satisfies _McpNoR;

type _SettingsNoR = [
  Exclude<ScannerR<ReturnType<typeof makeAgentSettingsScanner>>, never>,
] extends [never]
  ? true
  : false;
const _settingsNoR = true as const satisfies _SettingsNoR;

type ScannerE<T> = T extends Effect.Effect<infer _A, infer E, infer _R> ? E : never;
type _CanonicalNoE = [ScannerE<ReturnType<typeof makeCanonicalExtensionsScanner>>] extends [never]
  ? true
  : false;
const _canonicalNoE = true as const satisfies _CanonicalNoE;
type _AgentDirNoE = [ScannerE<ReturnType<typeof makeAgentDirScanner>>] extends [never]
  ? true
  : false;
const _agentDirNoE = true as const satisfies _AgentDirNoE;
type _McpNoE = [ScannerE<ReturnType<typeof makeMcpConfigScanner>>] extends [never] ? true : false;
const _mcpNoE = true as const satisfies _McpNoE;
type _SettingsNoE = [ScannerE<ReturnType<typeof makeAgentSettingsScanner>>] extends [never]
  ? true
  : false;
const _settingsNoE = true as const satisfies _SettingsNoE;

export type _Refs = [
  typeof _canonicalNoR,
  typeof _agentDirNoR,
  typeof _mcpNoR,
  typeof _settingsNoR,
  typeof _canonicalNoE,
  typeof _agentDirNoE,
  typeof _mcpNoE,
  typeof _settingsNoE,
];
