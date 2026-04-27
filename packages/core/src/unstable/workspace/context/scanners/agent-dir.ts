/**
 * Agent-directory scanner: enumerates per-agent skill, command, and subagent
 * directories declared by the existing `AgentRegistry`. Each occurrence
 * carries an `agent-dir` discriminator parameterized by `agentId` and the
 * subject `type`.
 *
 * Subject coverage in v1:
 *
 * - skill — every agent with `agent.skills.dir`.
 * - command — every agent with `agent.commands?.dir`.
 * - subagent — every agent with `agent.subagents?.dir`. Single-file
 *   subagent surfaces (`isFile === true`, e.g., `roo`'s `.roomodes`) emit one
 *   occurrence per file path; the file itself is the materialization.
 *
 * Rules: no agent in the v1 `AgentRegistry` exposes a rules directory, so the
 * scanner emits no rule occurrences.
 *
 * Each occurrence carries structural fields the subject modules need for
 * cross-platform path handling — `pathSegments` (the absolute path split via
 * the `Path` service) and `subjectFile` (the canonical primary file inside
 * the subject directory) — plus a probed `subjectFileExists` flag so subject
 * modules do not hardcode presence.
 *
 * Per Decision 5, scanner output is occurrence-shaped. The public effect
 * carries no `FileSystem | Path` requirement; per-file partial failures
 * publish diagnostic warnings rather than failing the cell.
 *
 * The scanner avoids `fs.stat` and uses only `fs.exists` / `fs.readDirectory`
 * so it remains compatible with the fixture builder's in-memory `FileSystem`.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { AGENTS } from "../../../agents/registry.js";
import type { AgentDescriptor, AgentId } from "../../../agents/types.js";
import type { Diagnostics } from "../diagnostics.js";
import type { Scope } from "../types.js";
import {
  childEntries,
  fileExists,
  filterDirectories,
  splitAbsolutePathSegments,
} from "./fs-helpers.js";
import type { AgentDirOccurrence, AgentDirSubjectType } from "./types.js";

const SCANNER_NAME = "agent-dir";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface AgentDirScannerDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly scope: Scope;
  readonly diagnostics: Diagnostics;
  readonly agentRegistry?: Readonly<Record<AgentId, AgentDescriptor>>;
}

/**
 * Closure helper: returns the dependency-closed scanner effect.
 */
export const makeAgentDirScanner = (
  deps: AgentDirScannerDeps,
): Effect.Effect<ReadonlyArray<AgentDirOccurrence>> => scanAgentDirs(deps);

// ---------------------------------------------------------------------------
// Per-subject path resolution
// ---------------------------------------------------------------------------

interface SubjectDir {
  readonly type: AgentDirSubjectType;
  readonly relativeDir: string;
  readonly isFile: boolean;
}

const subjectsForAgent = (descriptor: AgentDescriptor): ReadonlyArray<SubjectDir> => {
  const out: Array<SubjectDir> = [];
  out.push({ type: "skill", relativeDir: descriptor.skills.dir, isFile: false });
  if (descriptor.commands !== undefined) {
    out.push({
      type: "command",
      relativeDir: descriptor.commands.dir,
      isFile: false,
    });
  }
  if (descriptor.subagents !== undefined) {
    out.push({
      type: "subagent",
      relativeDir: descriptor.subagents.dir,
      isFile: descriptor.subagents.isFile === true,
    });
  }
  return out;
};

/**
 * Map a directory-style subject to the canonical primary file inside its
 * `<dir>/<name>/` content root. Mirrors the convention used by the
 * canonical-extensions scanner.
 */
const subjectFileNameFor = (type: AgentDirSubjectType): string => {
  switch (type) {
    case "skill":
      return "SKILL.md";
    case "command":
      return "command.md";
    case "subagent":
      return "subagent.md";
  }
};

/**
 * For directory-style subject roots: enumerate one level of subdirectories
 * and treat each subdirectory as a subject occurrence. The Phase 7 subject
 * module decides whether the directory is well-formed for its subject type.
 *
 * For each occurrence, probe the canonical subject file (e.g., `SKILL.md`)
 * via `fs.exists` so subject modules can consume `subjectFileExists` rather
 * than re-checking presence themselves.
 */
const scanSubjectDirectory = (
  deps: AgentDirScannerDeps,
  agentId: AgentId,
  subject: SubjectDir,
): Effect.Effect<ReadonlyArray<AgentDirOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, scope, workspaceRoot, diagnostics } = deps;
    const subjectAbsolute = path.join(workspaceRoot, subject.relativeDir);

    if (subject.isFile) {
      const present = yield* fileExists(SCANNER_NAME, fs, diagnostics, subjectAbsolute);
      if (!present) return [];
      const occurrence: AgentDirOccurrence = {
        _tag: "agent-dir",
        scope,
        type: subject.type,
        agentId,
        name: path.basename(subjectAbsolute),
        contentLocation: subjectAbsolute,
        pathSegments: splitAbsolutePathSegments(path, subjectAbsolute),
        // Single-file surfaces ARE the materialization; the file itself is
        // the subject file and presence has already been confirmed.
        subjectFile: Option.some(subjectAbsolute),
        subjectFileExists: true,
      };
      return [occurrence];
    }

    const candidates = yield* childEntries(SCANNER_NAME, fs, diagnostics, path, subjectAbsolute);
    const nameDirs = yield* filterDirectories(fs, candidates);
    const subjectFileName = subjectFileNameFor(subject.type);
    return yield* Effect.forEach(
      nameDirs,
      (nameDir) =>
        Effect.gen(function* () {
          const subjectFilePath = path.join(nameDir, subjectFileName);
          const subjectFileExists = yield* fileExists(
            SCANNER_NAME,
            fs,
            diagnostics,
            subjectFilePath,
          );
          const occurrence: AgentDirOccurrence = {
            _tag: "agent-dir",
            scope,
            type: subject.type,
            agentId,
            name: path.basename(nameDir),
            contentLocation: nameDir,
            pathSegments: splitAbsolutePathSegments(path, nameDir),
            subjectFile: Option.some(subjectFilePath),
            subjectFileExists,
          };
          return occurrence;
        }),
      { concurrency: "unbounded" },
    );
  });

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanAgentDirs = Effect.fn("workspace.context.scanner.agent-dir")(function* (
  deps: AgentDirScannerDeps,
) {
  const registry = deps.agentRegistry ?? AGENTS;

  const occurrences = yield* Effect.forEach(
    Object.values(registry),
    (descriptor) => {
      const subjects = subjectsForAgent(descriptor);
      return Effect.forEach(
        subjects,
        (subject) => scanSubjectDirectory(deps, descriptor.id, subject),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((results) => results.flat()));
    },
    { concurrency: "unbounded" },
  );

  return occurrences.flat();
});
