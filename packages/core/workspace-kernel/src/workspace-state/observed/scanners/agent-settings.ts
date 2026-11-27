/**
 * Agent-settings scanner: enumerates per-agent native settings files (e.g.,
 * `.claude/settings.json`, `.cursor/settings.json`).
 *
 * Per Decision 5, scanner output is occurrence-shaped. Each occurrence
 * represents one observable settings file — present and readable on disk —
 * keyed by `agentId`. The per-file payload is intentionally not parsed, here
 * or elsewhere in the read model. The scanner's contract is "this agent has
 * a settings file at this absolute path", not "this settings file is
 * well-formed".
 *
 * Per-file partial failures (e.g., unreadable directory) become diagnostic
 * warnings rather than errors. The error channel stays empty.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { Diagnostics } from "../diagnostics.js";
import type { Scope } from "../types.js";
import {
  agentRootSegment,
  makeAgentRootResolverState,
  type AgentRootResolverState,
} from "./agent-root.js";
import { SCANNER_IO_CONCURRENCY, settleFileExists } from "./fs-helpers.js";
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
  readonly agentRegistry?: Readonly<Record<ConfigurableAgentId, AgentDescriptor>>;
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
  const registry = deps.agentRegistry ?? AGENT_DESCRIPTORS;
  const rootResolverState = deps.rootResolverState ?? makeAgentRootResolverState();

  // Resolve each descriptor's settings path. `Option.none()` means the
  // descriptor opts out of native-config scanning — skip it.
  const subjects = Array.getSomes(
    yield* Effect.forEach(
      Object.values(registry),
      (descriptor) =>
        Effect.map(
          agentRootSegment(path, descriptor, diagnostics, rootResolverState),
          Option.map((segment) => ({
            descriptor,
            filePath: path.join(workspaceRoot, segment, "settings.json"),
          })),
        ),
      { concurrency: SCANNER_IO_CONCURRENCY },
    ),
  );

  // Agents that share a root directory share one settings file: probe each
  // distinct path once in this scan.
  const distinctPaths = Array.dedupe(subjects.map((subject) => subject.filePath));
  const probes = yield* Effect.forEach(
    distinctPaths,
    (filePath) => Effect.result(fs.exists(filePath)),
    { concurrency: SCANNER_IO_CONCURRENCY },
  );

  // Settle the shared outcome once per descriptor, in registry order, so each
  // descriptor keeps its own occurrence and its own diagnostic.
  const occurrences = yield* Effect.forEach(subjects, ({ descriptor, filePath }) =>
    Effect.gen(function* () {
      const probe = probes[distinctPaths.indexOf(filePath)];
      if (probe === undefined) return Option.none<AgentSettingsOccurrence>();
      const present = yield* settleFileExists(SCANNER_NAME, diagnostics, filePath, probe);
      if (!present) return Option.none<AgentSettingsOccurrence>();
      return Option.some<AgentSettingsOccurrence>({
        _tag: "agent-settings",
        scope,
        agentId: descriptor.id,
        contentLocation: makeAbsolutePath(path, filePath),
      });
    }),
  );

  return Array.getSomes(occurrences);
});
