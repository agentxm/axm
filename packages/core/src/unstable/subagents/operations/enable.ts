/**
 * Enable subagent executor — re-renders agent-native files for a previously disabled subagent.
 *
 * Two paths:
 * - Lock entry present: full enable (render files + update lock + settings)
 * - No lock entry: settings-only toggle (configured subagent with no lock backing)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { CodingAgentRepository } from "../../agents/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { sanitizeName } from "../../extensions/utils.js";
import { computeSourceHash, RenderedFilesMapSchema } from "../../extensions/rendered-files.js";
import { computeSubagentPaths, subagentContentFilename, subagentContentPath } from "../paths.js";
import type { SubagentPathSource } from "../paths.js";
import { parseSubagentMd } from "../subagent-content.js";
import { warnOnOrphanOverrides } from "../rendering/overrides.js";
import type { SubagentLockEntry } from "../../lockfile/index.js";

/**
 * Strip the meta-only `agentOverrides` key from a frontmatter map so it does
 * not leak into rendered files.
 */
const stripAgentOverrides = (
  fm: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  if (!("agentOverrides" in fm)) return fm;
  const { agentOverrides: _agentOverrides, ...rest } = fm;
  return rest;
};

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Enable a previously disabled subagent (re-render files and update state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EnableSubagentOperation = Operation<
  "enable-subagent",
  { readonly subagentName: string }
>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Derive a SubagentPathSource from a lock entry type. */
const lockEntryToPathSource = (lockEntry: SubagentLockEntry): SubagentPathSource =>
  lockEntry.type === "registry"
    ? { refType: "registry", owner: lockEntry.owner }
    : lockEntry.type === "local"
      ? { refType: "local" }
      : { refType: "git-hosted" };

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-subagent operation handler.
 *
 * Lock-backed path:
 * 1. Read configured agents, lock entry
 * 2. Compute canonical path
 * 3. Verify canonical directory exists
 * 4. Read and parse the subagent content file
 * 5. Render to all agents (concurrent)
 * 6. Update lockfile with rendered files and source hash
 * 7. Update settings entry to set enabled: true
 *
 * Settings-only path (no lock entry):
 * 1. Update settings entry to set enabled: true
 */
export const enableSubagent: OperationHandler<
  EnableSubagentOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;

    // Check for lock entry to determine path
    const lockEntryOption = yield* ws.getLockedSubagent(op.args.subagentName);

    // Settings-only path: no lock entry, just toggle enabled flag
    if (Option.isNone(lockEntryOption)) {
      yield* ws
        .updateSubagentEntry(op.args.subagentName, (e) => ({ ...e, enabled: true }))
        .pipe(Effect.catch(() => Effect.void));

      return {
        result: "success",
        message: `Enabled ${op.args.subagentName}`,
      } satisfies JobStepResult;
    }

    // Lock-backed path: full enable with rendering
    const lockEntry = lockEntryOption.value;
    const baseDir = ws.baseDir;
    const pathSource = lockEntryToPathSource(lockEntry);
    const sanitized = sanitizeName(op.args.subagentName);
    const paths = computeSubagentPaths(path.join, baseDir, pathSource, sanitized);

    // Verify canonical source exists
    const exists = yield* fs
      .exists(paths.subagentSrcPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeAppError({
        code: "not_found",
        message: `Subagent files for "${op.args.subagentName}" not found at ${paths.subagentSrcPath}`,
        breadcrumbs: [
          {
            description: "Try reinstalling the subagent with `axm subagents install`",
            cmd: "axm subagents install <source>",
          },
        ],
      });
    }

    // Read and parse the subagent content file
    const expectedFilename = subagentContentFilename(op.args.subagentName);
    const contentPath = subagentContentPath(path.join, paths.subagentSrcPath, op.args.subagentName);
    const rawContent = yield* fs.readFileString(contentPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          message: `Failed to read ${expectedFilename} from ${paths.subagentSrcPath}`,
          breadcrumbs: [
            {
              description: `Ensure the subagent content file exists at ${contentPath}.`,
            },
          ],
          cause: error,
        }),
      ),
    );
    const parsed = yield* parseSubagentMd(rawContent, op.args.subagentName);
    const currentHash = computeSourceHash(rawContent);
    const frontmatter: Readonly<Record<string, unknown>> = Option.getOrElse(
      parsed.frontmatter,
      () => ({}),
    );
    const agentOverrides = Option.getOrUndefined(parsed.agentOverrides);
    const renderFrontmatter = stripAgentOverrides(frontmatter);

    // Render to all configured agents
    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    yield* warnOnOrphanOverrides(
      `Subagent "${op.args.subagentName}"`,
      agentOverrides,
      configuredAgents.map((a) => a.id),
    );

    const renderedFilesMap: Record<string, Array<{ path: string }>> = {};

    yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        agent
          .addSubagent({
            workspaceRoot: baseDir,
            scope: "project",
            input: {
              agentId: agent.id,
              name: op.args.subagentName,
              body: parsed.body,
              frontmatter: renderFrontmatter,
              agentOverrides: agentOverrides?.[agent.id],
            },
            force: false,
          })
          .pipe(
            Effect.map((outcome) => {
              if (outcome._tag === "success") {
                renderedFilesMap[agent.id] = outcome.renderedFilePaths.map((p) => ({
                  path: p,
                }));
              }
            }),
          ),
      { concurrency: "unbounded" },
    );

    // Update lockfile with rendered files and source hash
    const decodeRenderedFiles = Schema.decodeUnknownSync(RenderedFilesMapSchema);
    const updatedLockEntry = {
      ...lockEntry,
      sourceHash: currentHash,
      renderedFiles: decodeRenderedFiles(renderedFilesMap),
    };
    yield* ws.setSubagentLock({ name: op.args.subagentName, lockEntry: updatedLockEntry });

    // Update settings entry to set enabled: true
    yield* ws
      .updateSubagentEntry(op.args.subagentName, (e) => ({ ...e, enabled: true }))
      .pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Enabled ${op.args.subagentName}`,
    } satisfies JobStepResult;
  });
