/**
 * In-memory `WorkspaceState` + accessor, used by fixture tests and the
 * determinism harness (task 3c.19).
 *
 * Autofix `fix` methods return per-extension `Operation` intents (see
 * `workspace/helpers/install-ops.ts`). The determinism harness applies those
 * intents to a mutable `WorkspaceState` and re-runs the rule's `check` against
 * a fresh `WorkspaceLintAccessor` backed by the updated state. The harness
 * asserts zero findings from that rule post-apply — establishing the
 * "apply(fix) + re-run(rule) === [] from that rule" determinism contract.
 *
 * The state model is intentionally minimal: just enough to satisfy the v1
 * rule-body probes (settings, lockfile, exists, list, knownAgents,
 * detectAgents, installedSkills, installedPacks). Fixtures declare their
 * state in JSON; the harness applies `Operation` intents via a pure
 * reducer.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type {
  AgentDetection,
  FileAccessError,
  LockfileDocument,
  PackRuleContext,
  SettingsDocument,
  SkillRuleContext,
  WorkspaceLintAccessor,
} from "../../context.js";
import type { AgentDescriptor, AgentId } from "../../../agents/types.js";
import { getAllAgents } from "../../../agents/registry.js";

// -----------------------------------------------------------------------------
// Mutable state model
// -----------------------------------------------------------------------------

/**
 * Mutable workspace state exercised by fixtures and the determinism harness.
 *
 * All fields start empty. Tests populate only what their rule needs; the
 * harness applies per-extension Operations through `applyIntent`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceState {
  /** Raw parsed `.axm/settings.json` (or `undefined` for missing file). */
  settings: SettingsDocument | undefined;
  /** Raw parsed `.axm/axm-lock.yaml` (or `undefined` for missing file). */
  lockfile: LockfileDocument | undefined;
  /** Workspace-relative posix paths the accessor treats as existing. */
  existingPaths: Set<string>;
  /** Writable paths (subset of existingPaths). */
  writablePaths: Set<string>;
  /** Map of parent-directory-relative posix path → immediate child names. */
  listings: Map<string, Array<string>>;
  /** Detected agent ids for `detectAgents("project")` at the current moment. */
  detectedProjectAgents: Set<AgentId>;
  /** Installed skills (project scope). */
  installedSkills: ReadonlyArray<SkillRuleContext>;
  /** Installed packs (project scope). */
  installedPacks: ReadonlyArray<PackRuleContext>;
}

/**
 * Factory returning an empty `WorkspaceState`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const emptyWorkspaceState = (): WorkspaceState => ({
  settings: undefined,
  lockfile: undefined,
  existingPaths: new Set(),
  writablePaths: new Set(),
  listings: new Map(),
  detectedProjectAgents: new Set(),
  installedSkills: [],
  installedPacks: [],
});

// -----------------------------------------------------------------------------
// Test accessor
// -----------------------------------------------------------------------------

/**
 * Build a `WorkspaceLintAccessor` backed by a mutable `WorkspaceState`.
 *
 * Reads are immediate — no concurrency. Calls return whatever the state
 * currently holds, so the determinism harness can mutate state between
 * `check` + `fix` + `check` without rebuilding the accessor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeStateBackedWorkspaceLintAccessor = (
  state: WorkspaceState,
): WorkspaceLintAccessor => ({
  settings: Effect.suspend(() =>
    state.settings === undefined
      ? Effect.fail({
          _tag: "SettingsReadError" as const,
          message: "settings.json is missing",
        })
      : Effect.succeed(state.settings),
  ),
  lockfile: Effect.suspend(() =>
    Effect.succeed(state.lockfile === undefined ? Option.none() : Option.some(state.lockfile)),
  ),
  installedSkills: Effect.suspend(() => Effect.succeed(state.installedSkills)),
  installedPacks: Effect.suspend(() => Effect.succeed(state.installedPacks)),
  knownAgents: Effect.sync((): ReadonlyArray<AgentDescriptor> => getAllAgents()),
  detectAgents: (scope) =>
    Effect.suspend(() => {
      if (scope !== "project") {
        const empty: ReadonlyArray<AgentDetection> = [];
        return Effect.succeed(empty);
      }
      const detections: Array<AgentDetection> = [];
      for (const id of state.detectedProjectAgents) {
        detections.push({ id, markerPath: `detected:${id}` });
      }
      return Effect.succeed(detections);
    }),
  exists: (path) =>
    Effect.suspend(() => Effect.succeed(state.existingPaths.has(normalizePath(path)))),
  isWritable: (path) =>
    Effect.suspend(() => Effect.succeed(state.writablePaths.has(normalizePath(path)))),
  list: (path) =>
    Effect.suspend(() => {
      const normalized = normalizePath(path);
      const listing = state.listings.get(normalized);
      if (listing === undefined) {
        return Effect.fail<FileAccessError>({
          _tag: "FileAccessError" as const,
          path,
          reason: "read-error" as const,
          message: `no listing for path ${path}`,
        });
      }
      return Effect.succeed<ReadonlyArray<string>>([...listing]);
    }),
});

const normalizePath = (input: string): string => {
  if (input === "" || input === "." || input === "./") {
    return "";
  }
  return input.replace(/\\/g, "/").replace(/^\.\//, "");
};
