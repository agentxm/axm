/**
 * Shared agent-root resolution.
 *
 * `agent-settings.ts` and `mcp-config.ts` both need to resolve a per-agent
 * root directory (e.g., `.claude` for `claude-code`, `.cursor` for `cursor`)
 * to compose agent-specific config paths (`<rootDir>/settings.json`,
 * `<rootDir>/mcp.json`).
 *
 * Resolution rules (with `exactOptionalPropertyTypes: true`, the descriptor
 * shape `rootDir?: string | undefined` distinguishes three states):
 *
 * 1. `descriptor.rootDir` is a `string` — use it directly.
 * 2. `descriptor.rootDir` is explicitly `undefined` (key present but
 *    nullish) — the agent has opted out of native-config scanning. Return
 *    `Option.none()` and the scanners SHALL skip this agent.
 * 3. `descriptor.rootDir` is omitted entirely — use the first segment of
 *    `descriptor.skills.dir` when the Skill surface exists. This handles
 *    platform-native separators and collapses `.` segments through the Path
 *    service's normalization.
 * 4. If there is no Skill surface, or the heuristic produces nothing, fall
 *    back to `.${descriptor.id}`.
 *
 * The heuristic-fallback path emits a one-time `scanner-config` diagnostic
 * warning per scanner instance per agent so agent maintainers see a nudge
 * to set `rootDir` explicitly. Collisions detected at construction time
 * also warn through the same `scanner-config` code.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";
import type { Diagnostics } from "../diagnostics.js";

// ---------------------------------------------------------------------------
// Resolver state — shared across the scanners that resolve agent roots
// ---------------------------------------------------------------------------

/**
 * Per-instance state shared across the scanners that resolve agent roots.
 * Both `mcp-config` and `agent-settings` share one tracker so a single
 * heuristic-fallback warning per agent fires across both scanners (rather
 * than once each).
 *
 * Construction is cheap: a `Set<string>` allocated by the live layer and
 * passed to both scanners.
 */
export interface AgentRootResolverState {
  readonly heuristicWarned: Set<string>;
}

export const makeAgentRootResolverState = (): AgentRootResolverState => ({
  heuristicWarned: new Set<string>(),
});

// ---------------------------------------------------------------------------
// Public resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the per-agent root directory for one descriptor. Returns
 * `Option.none()` when the agent has explicitly opted out of native-config
 * scanning (descriptor's `rootDir` is `undefined`); returns
 * `Option.some(segment)` otherwise.
 *
 * The result is intentionally a relative segment, not an absolute path:
 * each caller resolves the per-file path differently (`mcp.json` vs
 * `settings.json`), and the join concern stays at the call site.
 */
export const agentRootSegment = (
  path: Path.Path,
  descriptor: AgentDescriptor,
  diagnostics: Diagnostics,
  state: AgentRootResolverState,
): Effect.Effect<Option.Option<string>> => {
  // 1. Explicit `string` rootDir wins.
  if (typeof descriptor.rootDir === "string") {
    return Effect.succeed(Option.some(descriptor.rootDir));
  }

  // 2. The descriptor key is present and set to `undefined` — explicit
  // opt-out. With `exactOptionalPropertyTypes: true`, this is
  // distinguishable from key omission via the runtime `in` check.
  if ("rootDir" in descriptor && descriptor.rootDir === undefined) {
    return Effect.succeed(Option.none());
  }

  // 3. Heuristic fallback. Emit a one-time scanner-config warning per
  // agent so maintainers see the nudge to confirm `rootDir`.
  return Effect.gen(function* () {
    if (!state.heuristicWarned.has(descriptor.id)) {
      state.heuristicWarned.add(descriptor.id);
      yield* diagnostics.append({
        source: "scanner",
        message: `agent-root: descriptor for "${descriptor.id}" has no rootDir; falling back to its Skill directory or agent id`,
        code: "scanner-config",
      });
    }
    return Option.some(heuristicSegment(path, descriptor));
  });
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const heuristicSegment = (path: Path.Path, descriptor: AgentDescriptor): string => {
  const dir = descriptor.skills?.dir;
  if (dir === undefined) return `.${descriptor.id}`;
  if (dir.length === 0) return `.${descriptor.id}`;
  const segments = splitPathSegments(path, dir);
  const first = segments[0];
  if (first === undefined || first.length === 0) return `.${descriptor.id}`;
  return first;
};

/**
 * Split a path into its constituent segments using the Path service. Honors
 * the platform separator and skips empty segments produced by leading or
 * duplicate separators.
 */
const splitPathSegments = (path: Path.Path, value: string): ReadonlyArray<string> => {
  // Normalize first so `.` and `..` segments collapse the way the platform
  // expects, then split on the platform separator. Path.normalize preserves
  // a trailing separator only if one was present, which we drop by filtering
  // out empty segments.
  const normalized = path.normalize(value);
  return normalized.split(path.sep).filter((segment) => segment.length > 0);
};

// ---------------------------------------------------------------------------
// Collision detection (called at scanner-set construction time)
// ---------------------------------------------------------------------------

/**
 * Detect cases where two or more registry descriptors resolve to the same
 * `agentRootSegment`. The detection runs once at construction time (per
 * `WorkspaceReadModelLive` instance); each collision emits a
 * `scanner-config` diagnostic warning. The function does NOT throw and
 * does NOT skip scanning — callers continue to scan; the warning is the
 * signal.
 *
 * The check uses the same resolution rules as `agentRootSegment` but
 * inlined to avoid producing fallback warnings during collision checking
 * (the heuristic-fallback warning fires once per agent on first scanner
 * use; running it during collision detection would race with normal
 * scanner emission). Agents that opt out (`rootDir: undefined`) are
 * excluded from collision checking entirely.
 */
export const detectAgentRootCollisions = (
  path: Path.Path,
  descriptors: ReadonlyArray<AgentDescriptor>,
  diagnostics: Diagnostics,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const buckets = new Map<string, Array<string>>();
    for (const descriptor of descriptors) {
      const segment = resolveCollisionSegment(path, descriptor);
      if (Option.isNone(segment)) continue;
      const existing = buckets.get(segment.value);
      if (existing === undefined) {
        buckets.set(segment.value, [descriptor.id]);
      } else {
        existing.push(descriptor.id);
      }
    }
    for (const [segment, ids] of buckets) {
      if (ids.length < 2) continue;
      yield* diagnostics.append({
        source: "scanner",
        message: `agent-root: collision on "${segment}" across agents: ${ids.join(", ")}`,
        code: "scanner-config",
      });
    }
  });

const resolveCollisionSegment = (
  path: Path.Path,
  descriptor: AgentDescriptor,
): Option.Option<string> => {
  if (typeof descriptor.rootDir === "string") return Option.some(descriptor.rootDir);
  if ("rootDir" in descriptor && descriptor.rootDir === undefined) return Option.none();
  return Option.some(heuristicSegment(path, descriptor));
};
