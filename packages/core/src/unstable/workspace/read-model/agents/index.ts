/**
 * Agent registry barrel: re-exports every per-agent module's typed
 * `*NativeConfig` variant into the open `AgentNativeConfig` union and lists
 * every module in `registeredAgentModules`.
 *
 * Per design Decision 4 (per-subject modules carry the genuine variance) and
 * Decision 10 (`AgentNativeConfig` is an open union assembled from per-agent
 * modules), this is the single registration site for adding a new agent —
 * `WorkspaceReadModel` does NOT need to change.
 *
 * Adding a new agent: add the per-agent module file under `agents/<id>.ts`
 * exporting `agentModule` and `<Id>NativeConfig`, append the new id to
 * `AGENT_IDS`, and add ONE entry to `registeredAgentModulesArray` below. The
 * `AgentNativeConfig` union, `agentModulesById`, and the public
 * `registeredAgentModules` list all derive from that single source of truth.
 *
 * The barrel also exposes `ScopedAgentsApi` — the public shape of
 * `ctx.scope(scope).agents` returned by Phase 9's live composition. Phase 8
 * defines the contract; Phase 9 wires the concrete cells via
 * `makeScopedAgentsApi`.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AGENTS } from "../../../agents/registry.js";
import {
  AGENT_IDS,
  isConfigurableAgentId,
  type AgentDescriptor,
  type AgentId,
  type ConfigurableAgentId,
} from "../../../agents/types.js";
import type { SettingsReadError } from "../errors.js";
import type { Scope } from "../types.js";
import { agentModule as adal, type AdalNativeConfig } from "./adal.js";
import { agentModule as amp, type AmpNativeConfig } from "./amp.js";
import { agentModule as antigravity, type AntigravityNativeConfig } from "./antigravity.js";
import { agentModule as augment, type AugmentNativeConfig } from "./augment.js";
import { agentModule as claudeCode, type ClaudeCodeNativeConfig } from "./claude-code.js";
import { agentModule as cline, type ClineNativeConfig } from "./cline.js";
import { agentModule as codebuddy, type CodebuddyNativeConfig } from "./codebuddy.js";
import { agentModule as codex, type CodexNativeConfig } from "./codex.js";
import { agentModule as commandCode, type CommandCodeNativeConfig } from "./command-code.js";
import { agentModule as continueAgent, type ContinueNativeConfig } from "./continue.js";
import { agentModule as crush, type CrushNativeConfig } from "./crush.js";
import { agentModule as cursor, type CursorNativeConfig } from "./cursor.js";
import { agentModule as droid, type DroidNativeConfig } from "./droid.js";
import { agentModule as geminiCli, type GeminiCliNativeConfig } from "./gemini-cli.js";
import { agentModule as githubCopilot, type GithubCopilotNativeConfig } from "./github-copilot.js";
import { agentModule as goose, type GooseNativeConfig } from "./goose.js";
import { agentModule as iflowCli, type IflowCliNativeConfig } from "./iflow-cli.js";
import { agentModule as junie, type JunieNativeConfig } from "./junie.js";
import { agentModule as kilo, type KiloNativeConfig } from "./kilo.js";
import { agentModule as kimiCli, type KimiCliNativeConfig } from "./kimi-cli.js";
import { agentModule as kiroCli, type KiroCliNativeConfig } from "./kiro-cli.js";
import { agentModule as kode, type KodeNativeConfig } from "./kode.js";
import { agentModule as mcpjam, type McpjamNativeConfig } from "./mcpjam.js";
import { agentModule as mistralVibe, type MistralVibeNativeConfig } from "./mistral-vibe.js";
import { agentModule as mux, type MuxNativeConfig } from "./mux.js";
import { agentModule as neovate, type NeovateNativeConfig } from "./neovate.js";
import { agentModule as openclaw, type OpenclawNativeConfig } from "./openclaw.js";
import { agentModule as opencode, type OpencodeNativeConfig } from "./opencode.js";
import { agentModule as openhands, type OpenhandsNativeConfig } from "./openhands.js";
import { agentModule as pi, type PiNativeConfig } from "./pi.js";
import { agentModule as pochi, type PochiNativeConfig } from "./pochi.js";
import { agentModule as qoder, type QoderNativeConfig } from "./qoder.js";
import { agentModule as qwenCode, type QwenCodeNativeConfig } from "./qwen-code.js";
import { agentModule as replit, type ReplitNativeConfig } from "./replit.js";
import { agentModule as roo, type RooNativeConfig } from "./roo.js";
import { agentModule as trae, type TraeNativeConfig } from "./trae.js";
import { agentModule as traeCn, type TraeCnNativeConfig } from "./trae-cn.js";
import { agentModule as windsurf, type WindsurfNativeConfig } from "./windsurf.js";
import { agentModule as zencoder, type ZencoderNativeConfig } from "./zencoder.js";
import type {
  ActualAgent,
  AgentModule,
  AgentScannerObservations,
  DeclaredAgent,
  DeclaredSettingsShape,
  DetectedAgent,
} from "./types.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  ActualAgent,
  AgentModule,
  AgentScannerObservations,
  AgentSubjectType,
  DeclaredAgent,
  DeclaredSettingsShape,
  DetectedAgent,
  DetectionStatus,
} from "./types.js";

export { defineAgentModule } from "./types.js";

// ---------------------------------------------------------------------------
// Single source of truth: registered modules keyed by AgentId
// ---------------------------------------------------------------------------

/**
 * Source-of-truth record for every registered per-agent module, keyed by
 * `AgentId`. Adding a new agent: add a single entry here (plus the
 * per-agent module file under `agents/<id>.ts` and the `AGENT_IDS` literal).
 * The other derivations — `AgentNativeConfig` (open union),
 * `registeredAgentModules` (array), and `getAgentModule` (lookup) — follow
 * from this single record.
 *
 * The literal preserves each module's narrow `AgentModule<TNativeConfig, TId>`
 * shape so the derived `AgentNativeConfig` union picks up every per-agent
 * `_nativeConfig` variant. The `satisfies Record<AgentId, ...>` constraint
 * makes a missing or extra key fail at type-check.
 */
const registeredAgentModulesById = {
  adal,
  amp,
  antigravity,
  augment,
  "claude-code": claudeCode,
  cline,
  codebuddy,
  codex,
  "command-code": commandCode,
  continue: continueAgent,
  crush,
  cursor,
  droid,
  "gemini-cli": geminiCli,
  "github-copilot": githubCopilot,
  goose,
  "iflow-cli": iflowCli,
  junie,
  kilo,
  "kimi-cli": kimiCli,
  "kiro-cli": kiroCli,
  kode,
  mcpjam,
  "mistral-vibe": mistralVibe,
  mux,
  neovate,
  openclaw,
  opencode,
  openhands,
  pi,
  pochi,
  qoder,
  "qwen-code": qwenCode,
  replit,
  roo,
  trae,
  "trae-cn": traeCn,
  windsurf,
  zencoder,
};

// ---------------------------------------------------------------------------
// Open union of per-agent native config variants
// ---------------------------------------------------------------------------

/**
 * Open union of every registered per-agent module's `*NativeConfig` variant.
 *
 * Per design Decision 10: per-agent modules each export their typed variant;
 * the central `AgentNativeConfig` is re-exported from this barrel. The union
 * is derived from the typed `registeredAgentModulesById` record — the
 * `_nativeConfig` phantom field on each `AgentModule` carries the per-agent
 * variant, and `NonNullable` strips the optional marker so `undefined` does
 * not bleed into the union.
 *
 * v1 ships placeholder shapes (each variant carries its `agentId` only).
 * Later changes can tighten any individual variant without breaking this
 * union.
 */
export type AgentNativeConfig = NonNullable<
  (typeof registeredAgentModulesById)[keyof typeof registeredAgentModulesById]["_nativeConfig"]
>;

export type {
  AdalNativeConfig,
  AmpNativeConfig,
  AntigravityNativeConfig,
  AugmentNativeConfig,
  ClaudeCodeNativeConfig,
  ClineNativeConfig,
  CodebuddyNativeConfig,
  CodexNativeConfig,
  CommandCodeNativeConfig,
  ContinueNativeConfig,
  CrushNativeConfig,
  CursorNativeConfig,
  DroidNativeConfig,
  GeminiCliNativeConfig,
  GithubCopilotNativeConfig,
  GooseNativeConfig,
  IflowCliNativeConfig,
  JunieNativeConfig,
  KiloNativeConfig,
  KimiCliNativeConfig,
  KiroCliNativeConfig,
  KodeNativeConfig,
  McpjamNativeConfig,
  MistralVibeNativeConfig,
  MuxNativeConfig,
  NeovateNativeConfig,
  OpenclawNativeConfig,
  OpencodeNativeConfig,
  OpenhandsNativeConfig,
  PiNativeConfig,
  PochiNativeConfig,
  QoderNativeConfig,
  QwenCodeNativeConfig,
  ReplitNativeConfig,
  RooNativeConfig,
  TraeNativeConfig,
  TraeCnNativeConfig,
  WindsurfNativeConfig,
  ZencoderNativeConfig,
};

// ---------------------------------------------------------------------------
// Registered agent modules
// ---------------------------------------------------------------------------

/**
 * Compile-time coverage check: the keys of `registeredAgentModulesById` must
 * be exactly `AgentId`. Both directions are checked so a missing key OR an
 * extra key fails type-check.
 */
type RegisteredAgentIds = keyof typeof registeredAgentModulesById;
type _RegisteredCoversAgentId =
  Exclude<ConfigurableAgentId, RegisteredAgentIds> extends never ? true : false;
type _AgentIdCoversRegistered =
  Exclude<RegisteredAgentIds, ConfigurableAgentId> extends never ? true : false;
const _registeredCoversAgentId = true as const satisfies _RegisteredCoversAgentId;
const _agentIdCoversRegistered = true as const satisfies _AgentIdCoversRegistered;
// Reference the compile-time witnesses so `noUnusedLocals` does not flag
// them. They exist purely to fail type-check on coverage drift.
export type _AgentRegistryCoverage = [
  typeof _registeredCoversAgentId,
  typeof _agentIdCoversRegistered,
];

/**
 * Typed registry of every per-agent module keyed by `AgentId`. The
 * `Record<AgentId, AgentModule<AgentNativeConfig>>` annotation re-frames the
 * narrow per-module types from `registeredAgentModulesById` into the
 * widened union shape downstream consumers expect.
 */
const agentModulesById: Record<
  ConfigurableAgentId,
  AgentModule<AgentNativeConfig>
> = registeredAgentModulesById;

/**
 * Every registered per-agent module. Order matches the canonical `AGENT_IDS`
 * tuple so consumers can iterate in registry order.
 */
export const registeredAgentModules: ReadonlyArray<AgentModule<AgentNativeConfig>> = Array.getSomes(
  Array.map(AGENT_IDS, (id) =>
    isConfigurableAgentId(id) ? Option.some(agentModulesById[id]) : Option.none(),
  ),
);

/**
 * Look up a per-agent module by id. Direct typed-record access — every
 * `AgentId` is guaranteed to map to a module at type-check.
 */
export const getAgentModule = (id: ConfigurableAgentId): AgentModule<AgentNativeConfig> =>
  agentModulesById[id];

const isAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

// ---------------------------------------------------------------------------
// Scoped agents API
// ---------------------------------------------------------------------------

/**
 * Public shape of `ctx.scope(scope).agents`. Per design Decision 3, agents
 * have declared + actual only; no resolved layer.
 *
 * - `list` — every registered agent id (alias of `AGENT_IDS`).
 * - `known` — every registered agent descriptor in registry order.
 * - `byId(id)` — descriptor lookup for known agents.
 * - `declared(id)` — settings-derived declaration; fails with the narrow
 *   `SettingsReadError` family when settings exist but cannot be decoded.
 * - `actual(id)` — scanner-derived presence evidence; never fails.
 * - `detected` — composition over declared + actual for every known id;
 *   never fails.
 */
export interface ScopedAgentsApi {
  readonly list: Effect.Effect<ReadonlyArray<AgentId>>;
  readonly known: Effect.Effect<ReadonlyArray<AgentDescriptor>>;
  readonly byId: (id: string) => Option.Option<AgentDescriptor>;
  readonly declared: (
    id: AgentId,
  ) => Effect.Effect<Option.Option<DeclaredAgent>, SettingsReadError>;
  readonly actual: (id: AgentId) => Effect.Effect<Option.Option<ActualAgent>>;
  readonly detected: Effect.Effect<ReadonlyArray<DetectedAgent>>;
}

/**
 * Inputs `makeScopedAgentsApi` captures. Phase 9's live composition resolves
 * these once before constructing the API:
 *
 * - `scope` — the scope this API serves.
 * - `settings` — cached settings loader (already dependency-closed).
 * - `observations` — cached scanner observations sliced to this scope. Per
 *   Decision 5, the live layer feeds the agent-dir, agent-settings, and
 *   per-agent MCP-config occurrence sets here.
 */
export interface ScopedAgentsApiDeps {
  readonly scope: Scope;
  readonly settings: Effect.Effect<Option.Option<DeclaredSettingsShape>, SettingsReadError>;
  readonly observations: Effect.Effect<AgentScannerObservations>;
}

/**
 * Build a `ScopedAgentsApi` for one scope. The resulting cells are
 * dependency-closed — no `FileSystem | Path | AgentRegistry` requirement
 * leaks into `R`.
 *
 * Each `declared(id)` and `actual(id)` call routes through the corresponding
 * per-agent module's projector. `detected` iterates `registeredAgentModules`,
 * folds the per-agent results, and returns the projection in registry order.
 */
export const makeScopedAgentsApi = (deps: ScopedAgentsApiDeps): ScopedAgentsApi => {
  const { scope, settings, observations } = deps;

  // Pure projection: `Effect.map` over the cached settings cell. Avoids the
  // `Effect.gen` wrapper that previously fronted a one-yield-plus-pure-call
  // pattern.
  const declared = (id: AgentId) =>
    isConfigurableAgentId(id)
      ? settings.pipe(Effect.map((decoded) => getAgentModule(id).declared(scope, decoded)))
      : Effect.succeed(Option.none<DeclaredAgent>());

  const actual = (id: AgentId) =>
    isConfigurableAgentId(id)
      ? observations.pipe(Effect.map((obs) => getAgentModule(id).actual(scope, obs)))
      : Effect.succeed(Option.none<ActualAgent>());

  // The detected projection is resilient (per spec — never fails). Settings
  // can fail with `SettingsReadError`; we swallow the error and treat it as
  // "no declarations" so detection still returns `unmanaged-present` rows
  // for any actually-observed agents.
  //
  // Combine the (possibly recovered) settings cell with `observations` via
  // `Effect.zip`, then project. The body stays pure post-zip — no `Effect.gen`
  // wrapper needed.
  const detected = Effect.zip(
    Effect.result(settings).pipe(
      Effect.map((settingsResult) =>
        settingsResult._tag === "Failure"
          ? Option.none<DeclaredSettingsShape>()
          : settingsResult.success,
      ),
    ),
    observations,
  ).pipe(
    Effect.map(([decoded, obs]) =>
      Array.getSomes(
        registeredAgentModules.map((m) =>
          m.detected(scope, m.declared(scope, decoded), m.actual(scope, obs)),
        ),
      ),
    ),
  );

  return {
    list: Effect.succeed(AGENT_IDS),
    known: Effect.succeed(AGENT_IDS.map((id) => AGENTS[id])),
    byId: (id) => (isAgentId(id) ? Option.some(AGENTS[id]) : Option.none()),
    declared,
    actual,
    detected,
  };
};
