/**
 * Agent-settings scanner: enumerates per-agent native settings files (e.g.,
 * `.claude/settings.json`, `.cursor/settings.json`).
 *
 * Per Decision 5, scanner output is occurrence-shaped. Each occurrence
 * represents one observable settings file — present and readable on disk —
 * keyed by `agentId`. The per-file payload is intentionally not parsed here:
 * Phase 8's per-agent modules decode the typed `nativeConfig` shape through
 * their own schemas. The scanner's contract is "this agent has a settings
 * file at this absolute path", not "this settings file is well-formed".
 *
 * Per-file partial failures (e.g., unreadable directory) become diagnostic
 * warnings rather than errors. The error channel stays empty.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { AGENTS } from "../../../agents/registry.js";
import type { AgentDescriptor, AgentId } from "../../../agents/types.js";
import type { Diagnostics } from "../diagnostics.js";
import type { Scope } from "../types.js";
import {
  agentRootSegment,
  makeAgentRootResolverState,
  type AgentRootResolverState,
} from "./agent-root.js";
import { fileExists } from "./fs-helpers.js";
import type { AgentSettingsOccurrence } from "./types.js";

const SCANNER_NAME = "agent-settings";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Inputs the live layer captures before invoking the scanner. The optional
 * `agentRegistry` mirrors the agent-dir scanner. `rootResolverState` lets
 * the live layer share heuristic-warning state across `mcp-config` and
 * `agent-settings`; when omitted, a fresh state is used (one warning per
 * scanner invocation per agent).
 */
export interface AgentSettingsScannerDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly scope: Scope;
  readonly diagnostics: Diagnostics;
  readonly agentRegistry?: Readonly<Record<AgentId, AgentDescriptor>>;
  readonly rootResolverState?: AgentRootResolverState;
}

/**
 * Closure helper: returns the dependency-closed scanner effect.
 */
export const makeAgentSettingsScanner = (
  deps: AgentSettingsScannerDeps,
): Effect.Effect<ReadonlyArray<AgentSettingsOccurrence>> => scanAgentSettings(deps);

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanAgentSettings = Effect.fn("workspace.read-model.scanner.agent-settings")(function* (
  deps: AgentSettingsScannerDeps,
) {
  const { fs, path, workspaceRoot, scope, diagnostics } = deps;
  const registry = deps.agentRegistry ?? AGENTS;
  const rootResolverState = deps.rootResolverState ?? makeAgentRootResolverState();

  const occurrences = yield* Effect.forEach(
    Object.values(registry),
    (descriptor) =>
      Effect.gen(function* () {
        // Resolve the per-agent root segment. `Option.none()` means the
        // descriptor opts out of native-config scanning — skip it.
        const rootSegmentOpt = yield* agentRootSegment(
          path,
          descriptor,
          diagnostics,
          rootResolverState,
        );
        if (Option.isNone(rootSegmentOpt)) {
          return Option.none<AgentSettingsOccurrence>();
        }
        const filePath = path.join(workspaceRoot, rootSegmentOpt.value, "settings.json");
        const present = yield* fileExists(SCANNER_NAME, fs, diagnostics, filePath);
        if (!present) return Option.none<AgentSettingsOccurrence>();
        return Option.some<AgentSettingsOccurrence>({
          _tag: "agent-settings",
          scope,
          agentId: descriptor.id,
          contentLocation: filePath,
        });
      }),
    { concurrency: "unbounded" },
  );

  return Array.getSomes(occurrences);
});
