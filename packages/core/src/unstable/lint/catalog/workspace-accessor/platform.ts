/**
 * Platform-backed `WorkspaceLintAccessor`.
 *
 * Reads `.axm/settings.json`, `.axm/axm-lock.yaml`, and workspace-relative
 * filesystem probes from a caller-supplied workspace root. Surfaces ONLY the
 * nine documented methods (task 3c.2):
 *
 *   `settings`, `lockfile`, `installedSkills`, `installedPacks`,
 *   `knownAgents`, `detectAgents`, `exists`, `isWritable`, `list`.
 *
 * No Layer wiring at rule-evaluation time — the factory captures
 * `FileSystem.FileSystem` + `Path.Path` plus the provided `WorkspaceIndex`.
 *
 * Agent-detection derives probes from the existing `AgentDescriptor`
 * catalog (`packages/core/src/unstable/agents/types.ts`); the rule does not
 * re-invent probe derivation.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import YAML from "yaml";
import type {
  AgentDetection,
  FileAccessError,
  LockfileDocument,
  LockfileReadError,
  PackRuleContext,
  SettingsDocument,
  SettingsReadError,
  SkillRuleContext,
  WorkspaceLintAccessor,
} from "../../context.js";
import type { AgentDescriptor } from "../../../agents/types.js";
import { getAllAgents } from "../../../agents/registry.js";
import { UNIVERSAL_SKILLS_DIR_SEGMENT } from "../../../extensions/universal-skills-dir.js";

// -----------------------------------------------------------------------------
// WorkspaceIndex
// -----------------------------------------------------------------------------

/**
 * Minimal shape the workspace accessor requires to compute `installedSkills`
 * and `installedPacks`. Phase 3c's `WorkspaceIndex` (see `./contexts.ts`)
 * satisfies this by construction.
 */
export interface WorkspaceIndexView {
  readonly installedSkills: Effect.Effect<ReadonlyArray<SkillRuleContext>>;
  readonly installedPacks: Effect.Effect<ReadonlyArray<PackRuleContext>>;
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Platform services required by `makePlatformWorkspaceLintAccessor`.
 */
export interface WorkspaceAccessorPlatform {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

/** Factory arguments. */
export interface PlatformWorkspaceLintAccessorArgs {
  readonly platform: WorkspaceAccessorPlatform;
  /** Absolute path to the workspace root (directory containing `.axm/`). */
  readonly workspaceRoot: string;
  /**
   * Workspace index exposing `installedSkills` and `installedPacks` rule
   * contexts. Usually produced by `buildWorkspaceIndex` in `./contexts.ts`.
   */
  readonly index: WorkspaceIndexView;
  /** Scope of the accessor for `detectAgents` routing. */
  readonly scope: "project" | "user";
}

type ResolveResult =
  | { readonly kind: "ok"; readonly absolute: string }
  | { readonly kind: "escape" };

const SETTINGS_REL_PATH = ".axm/settings.json";
const LOCKFILE_REL_PATH = ".axm/axm-lock.yaml";

/**
 * Build a platform-backed `WorkspaceLintAccessor` rooted at `workspaceRoot`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makePlatformWorkspaceLintAccessor = (
  args: PlatformWorkspaceLintAccessorArgs,
): WorkspaceLintAccessor => {
  const { platform, workspaceRoot, index, scope } = args;
  const { fs, path } = platform;
  const root = path.resolve(workspaceRoot);

  const resolveWithinRoot = (input: string): ResolveResult => {
    if (input === "" || input === "." || input === "./") {
      return { kind: "ok", absolute: root };
    }
    if (/^[a-z]:[\\/]/i.test(input) || input.startsWith("/") || input.startsWith("\\")) {
      return { kind: "escape" };
    }
    const normalized = input.replace(/\\/g, "/").replace(/^\.\//, "");
    for (const segment of normalized.split("/")) {
      if (segment === "..") {
        return { kind: "escape" };
      }
    }
    const absolute = path.resolve(root, normalized);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      return { kind: "escape" };
    }
    return { kind: "ok", absolute };
  };

  const makeAccessError = (
    p: string,
    reason: FileAccessError["reason"],
    message: string,
  ): FileAccessError => ({
    _tag: "FileAccessError" as const,
    path: p,
    reason,
    message,
  });

  const exists = (relative: string): Effect.Effect<boolean> => {
    const resolved = resolveWithinRoot(relative);
    if (resolved.kind !== "ok") {
      return Effect.succeed(false);
    }
    return fs.exists(resolved.absolute).pipe(Effect.catch(() => Effect.succeed(false)));
  };

  const isWritable = (relative: string): Effect.Effect<boolean> => {
    const resolved = resolveWithinRoot(relative);
    if (resolved.kind !== "ok") {
      return Effect.succeed(false);
    }
    return fs.access(resolved.absolute, { writable: true }).pipe(
      Effect.map(() => true),
      Effect.catch(() => Effect.succeed(false)),
    );
  };

  const list = (relative: string): Effect.Effect<ReadonlyArray<string>, FileAccessError> => {
    const resolved = resolveWithinRoot(relative);
    if (resolved.kind === "escape") {
      return Effect.fail(
        makeAccessError(relative, "path-escape", `path escapes the accessor root: ${relative}`),
      );
    }
    return fs
      .readDirectory(resolved.absolute)
      .pipe(
        Effect.mapError((cause) =>
          makeAccessError(
            relative,
            "read-error",
            `directory list failed at ${relative}: ${String(cause)}`,
          ),
        ),
      );
  };

  const parseSettingsRaw = (raw: string): Effect.Effect<SettingsDocument, SettingsReadError> =>
    Effect.try({
      try: (): SettingsDocument => JSON.parse(raw),
      catch: (cause): SettingsReadError => ({
        _tag: "SettingsReadError" as const,
        message: `JSON parse failed: ${String(cause)}`,
      }),
    });

  const settings: Effect.Effect<SettingsDocument, SettingsReadError> = Effect.gen(function* () {
    const resolved = resolveWithinRoot(SETTINGS_REL_PATH);
    if (resolved.kind !== "ok") {
      return yield* Effect.fail<SettingsReadError>({
        _tag: "SettingsReadError" as const,
        message: "settings.json path is outside the workspace root",
      });
    }
    const raw = yield* fs.readFileString(resolved.absolute).pipe(
      Effect.mapError(
        (cause): SettingsReadError => ({
          _tag: "SettingsReadError" as const,
          message: `read failed: ${String(cause)}`,
        }),
      ),
    );
    return yield* parseSettingsRaw(raw);
  });

  const parseLockfileRaw = (
    raw: string,
  ): Effect.Effect<Option.Option<LockfileDocument>, LockfileReadError> =>
    Effect.try({
      try: (): Option.Option<LockfileDocument> => Option.some(YAML.parse(raw)),
      catch: (cause): LockfileReadError => ({
        _tag: "LockfileReadError" as const,
        message: `YAML parse failed: ${String(cause)}`,
      }),
    });

  const lockfile: Effect.Effect<Option.Option<LockfileDocument>, LockfileReadError> = Effect.gen(
    function* () {
      const resolved = resolveWithinRoot(LOCKFILE_REL_PATH);
      if (resolved.kind !== "ok") {
        return yield* Effect.fail<LockfileReadError>({
          _tag: "LockfileReadError" as const,
          message: "axm-lock.yaml path is outside the workspace root",
        });
      }
      const lockExists = yield* fs
        .exists(resolved.absolute)
        .pipe(Effect.catch(() => Effect.succeed(false)));
      if (!lockExists) {
        return Option.none<LockfileDocument>();
      }
      const raw = yield* fs.readFileString(resolved.absolute).pipe(
        Effect.mapError(
          (cause): LockfileReadError => ({
            _tag: "LockfileReadError" as const,
            message: `read failed: ${String(cause)}`,
          }),
        ),
      );
      return yield* parseLockfileRaw(raw);
    },
  );

  const knownAgents: Effect.Effect<ReadonlyArray<AgentDescriptor>> = Effect.sync(() =>
    getAllAgents(),
  );

  const detectAgents = (
    detectScope: "project" | "user",
  ): Effect.Effect<ReadonlyArray<AgentDetection>> => {
    if (detectScope !== scope) {
      // Honor the caller's requested scope even when the accessor was
      // bound to a different one — this is informational only.
      return Effect.succeed([]);
    }
    const agents = getAllAgents();
    return Effect.all(
      agents.map((agent) =>
        detectOne(agent).pipe(
          Effect.map(
            (detection): ReadonlyArray<AgentDetection> =>
              detection === undefined ? [] : [detection],
          ),
        ),
      ),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => results.flat()));
  };

  const detectOne = (agent: AgentDescriptor): Effect.Effect<AgentDetection | undefined> =>
    Effect.gen(function* () {
      for (const segment of detectionProbes(agent)) {
        const probeAbs = path.resolve(root, segment);
        const present = yield* fs.exists(probeAbs).pipe(Effect.catch(() => Effect.succeed(false)));
        if (present) {
          return { id: agent.id, markerPath: segment } satisfies AgentDetection;
        }
      }
      return undefined;
    });

  return {
    settings,
    lockfile,
    installedSkills: index.installedSkills,
    installedPacks: index.installedPacks,
    knownAgents,
    detectAgents,
    exists,
    isWritable,
    list,
  };
};

// -----------------------------------------------------------------------------
// Probe derivation
// -----------------------------------------------------------------------------

const firstPathSegment = (dir: string | undefined): string | undefined => {
  if (dir === undefined || dir === "") {
    return undefined;
  }
  const segment = dir.split("/")[0];
  return segment === undefined || segment.length === 0 ? undefined : segment;
};

/**
 * Derive detection probes for an agent by taking the first path segment of
 * its `skills.dir` / `commands.dir` / `subagents.dir`, plus the single-file
 * probe when `subagents.isFile === true`.
 *
 * Mirrors axm `agents/detection.ts:35-44` — staying in lockstep with the
 * canonical detection so the rule and the CLI detector agree.
 */
const detectionProbes = (agent: AgentDescriptor): ReadonlyArray<string> => {
  const segments = new Set<string>();
  const skills = firstPathSegment(agent.skills.dir);
  if (skills !== undefined && skills !== UNIVERSAL_SKILLS_DIR_SEGMENT) {
    segments.add(skills);
  }
  const commands = firstPathSegment(agent.commands?.dir);
  if (commands !== undefined) {
    segments.add(commands);
  }
  const subagents = firstPathSegment(agent.subagents?.dir);
  if (subagents !== undefined) {
    segments.add(subagents);
  }
  if (agent.subagents?.isFile === true && agent.subagents.dir !== undefined) {
    segments.add(agent.subagents.dir);
  }
  return Array.from(segments);
};
