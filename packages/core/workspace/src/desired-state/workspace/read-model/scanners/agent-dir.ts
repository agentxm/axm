/**
 * Agent-directory scanner: enumerates per-agent skill and subagent
 * directories declared by the existing `AgentRegistry`. Each occurrence
 * carries an `agent-dir` discriminator parameterized by `agentId` and the
 * subject `type`.
 *
 * Subject coverage in v1:
 *
 * - skill — every agent with a non-empty `agent.skills.dir`.
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
 * Shared physical read paths are observed once and projected to each agent.
 */

import * as Effect from "effect/Effect";
import * as Array from "effect/Array";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentDescriptor, AgentId } from "@agentxm/extension-model/unstable/agents/types";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { Diagnostics } from "../diagnostics.js";
import type { Scope } from "../types.js";
import {
  childEntries,
  fileExists,
  filterDirectories,
  SCANNER_IO_CONCURRENCY,
  splitAbsolutePathSegments,
} from "./fs-helpers.js";
import type { AgentDirOccurrence, AgentDirSubjectType } from "./types.js";

const SCANNER_NAME = "agent-dir";

const normalizeFileBackedName = (name: string): string => {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return normalized === "" ? "unnamed" : normalized;
};

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface AgentDirScannerDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly scope: Scope;
  readonly diagnostics: Diagnostics;
  readonly agentRegistry?: Readonly<Partial<Record<AgentId, AgentDescriptor>>>;
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
  readonly readPathStatus?: "primary" | "canonical" | "compat" | "deprecated";
}

const subjectsForAgent = (descriptor: AgentDescriptor): ReadonlyArray<SubjectDir> => {
  const out: Array<SubjectDir> = [];
  if (descriptor.skills !== undefined) {
    if (descriptor.skills.dir.length > 0) {
      out.push({
        type: "skill",
        relativeDir: descriptor.skills.dir,
        isFile: false,
        readPathStatus: "primary",
      });
    }
    for (const { path, status } of descriptor.skills.additionalReadPaths) {
      out.push({ type: "skill", relativeDir: path, isFile: false, readPathStatus: status });
    }
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
 * Map a directory-style subject + name to the canonical primary file inside
 * its `<dir>/<name>/` content root. Mirrors the convention used by the
 * canonical-extensions scanner.
 *
 * - `skill` → `SKILL.md` (fixed)
 */
const subjectFileNameFor = (): string => "SKILL.md";

type PhysicalOccurrence = Omit<AgentDirOccurrence, "agentId" | "readPathStatus">;

/**
 * Skills use one subdirectory per subject. Subagents use the flat files AXM's
 * agent renderers produce.
 *
 * For each occurrence, probe the canonical subject file (e.g., `SKILL.md`)
 * via `fs.exists` so subject modules can consume `subjectFileExists` rather
 * than re-checking presence themselves.
 */
const scanSubjectDirectory = (
  deps: AgentDirScannerDeps,
  subject: SubjectDir,
): Effect.Effect<ReadonlyArray<PhysicalOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, scope, workspaceRoot, diagnostics } = deps;
    const subjectAbsolute = path.join(workspaceRoot, subject.relativeDir);

    if (subject.isFile) {
      const present = yield* fileExists(SCANNER_NAME, fs, diagnostics, subjectAbsolute);
      if (!present) return [];
      const contentLocation = makeAbsolutePath(path, subjectAbsolute);
      const occurrence: PhysicalOccurrence = {
        _tag: "agent-dir",
        scope,
        type: subject.type,
        name: normalizeFileBackedName(path.basename(subjectAbsolute)),
        contentLocation,
        pathSegments: splitAbsolutePathSegments(path, subjectAbsolute),
        // Single-file surfaces ARE the materialization; the file itself is
        // the subject file and presence has already been confirmed.
        subjectFile: Option.some(contentLocation),
        subjectFileExists: true,
      };
      return [occurrence];
    }

    const candidates = yield* childEntries(SCANNER_NAME, fs, diagnostics, path, subjectAbsolute);
    const nameDirs = yield* filterDirectories(SCANNER_NAME, fs, diagnostics, candidates);
    if (subject.type === "skill") {
      return yield* Effect.forEach(
        nameDirs,
        (nameDir) =>
          Effect.gen(function* () {
            const name = path.basename(nameDir);
            const subjectFilePath = path.join(nameDir, subjectFileNameFor());
            const subjectFileExists = yield* fileExists(
              SCANNER_NAME,
              fs,
              diagnostics,
              subjectFilePath,
            );
            const contentLocation = makeAbsolutePath(path, nameDir);
            return {
              _tag: "agent-dir",
              scope,
              type: subject.type,
              name,
              contentLocation,
              pathSegments: splitAbsolutePathSegments(path, nameDir),
              subjectFile: Option.some(makeAbsolutePath(path, subjectFilePath)),
              subjectFileExists,
            } satisfies PhysicalOccurrence;
          }),
        { concurrency: SCANNER_IO_CONCURRENCY },
      );
    }

    const supportedExtensions = [".md", ".json", ".toml"];
    const directorySet = new Set(nameDirs);
    const fileOccurrences = yield* Effect.forEach(
      candidates,
      (candidate) =>
        Effect.gen(function* () {
          if (directorySet.has(candidate)) return Option.none<PhysicalOccurrence>();
          const extension = path.extname(candidate).toLowerCase();
          if (!supportedExtensions.includes(extension)) {
            return Option.none<PhysicalOccurrence>();
          }
          const readable = yield* Effect.result(fs.readFile(candidate));
          if (readable._tag === "Failure") {
            if (readable.failure.reason._tag !== "NotFound") {
              yield* diagnostics.append({
                source: "scanner",
                message: `${SCANNER_NAME}: cannot read ${candidate}`,
                path: candidate,
                code: "scanner-io",
              });
            }
            return Option.none<PhysicalOccurrence>();
          }
          const fileName = path.basename(candidate);
          const name = normalizeFileBackedName(fileName.slice(0, -extension.length));
          const contentLocation = makeAbsolutePath(path, candidate);
          return Option.some({
            _tag: "agent-dir",
            scope,
            type: subject.type,
            name,
            contentLocation,
            pathSegments: splitAbsolutePathSegments(path, candidate),
            subjectFile: Option.some(contentLocation),
            subjectFileExists: true,
          } satisfies PhysicalOccurrence);
        }),
      { concurrency: SCANNER_IO_CONCURRENCY },
    );
    return fileOccurrences.flatMap(Option.toArray);
  });

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanAgentDirs = Effect.fn("workspace.read-model.scanner.agent-dir")(function* (
  deps: AgentDirScannerDeps,
) {
  const registry = deps.agentRegistry ?? AGENTS;

  const requests = Object.values(registry).flatMap((descriptor) =>
    subjectsForAgent(descriptor).map((subject) => ({ agentId: descriptor.id, subject })),
  );
  const samePhysicalSubject = (left: SubjectDir, right: SubjectDir) =>
    left.type === right.type &&
    left.relativeDir === right.relativeDir &&
    left.isFile === right.isFile;
  const subjects = Array.dedupeWith(
    requests.map(({ subject }) => subject),
    samePhysicalSubject,
  );
  const observations = yield* Effect.forEach(subjects, (subject) =>
    scanSubjectDirectory(deps, subject).pipe(
      Effect.map((facts) =>
        requests.flatMap((request, index) =>
          samePhysicalSubject(request.subject, subject)
            ? [
                {
                  index,
                  occurrences: facts.map((fact): AgentDirOccurrence => ({
                    ...fact,
                    agentId: request.agentId,
                    ...(request.subject.readPathStatus === undefined
                      ? {}
                      : { readPathStatus: request.subject.readPathStatus }),
                  })),
                },
              ]
            : [],
        ),
      ),
    ),
  );
  return observations
    .flat()
    .sort((left, right) => left.index - right.index)
    .flatMap(({ occurrences }) => occurrences);
});
