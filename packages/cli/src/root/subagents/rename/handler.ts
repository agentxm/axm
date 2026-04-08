/**
 * Rename command handler - Effect-based orchestration for `axm subagents rename`.
 *
 * Validates subagent state then builds and resolves a single-step plan.
 * Rename is restricted to locally-authored subagents; registry and
 * pack-installed subagents are rejected.
 *
 * Pipeline: validate -> rename canonical dir -> update SUBAGENT.md frontmatter ->
 * remove old rendered files -> render new ones -> update settings + lockfile keys.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import matter from "gray-matter";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { Plan, PlannedJobStep, JobStepResult } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { CodingAgentRepository } from "@axm.sh/core/unstable/agents";
import type { SubagentLockEntry } from "@axm.sh/core/unstable/lockfile";
import {
  computeSubagentPaths,
  SUBAGENT_CONTENT_FILENAME,
  parseSubagentMd,
} from "@axm.sh/core/unstable/subagents";
import type { SubagentPathSource } from "@axm.sh/core/unstable/subagents";
import { sanitizeName } from "@axm.sh/core/unstable/extensions";
import { computeSourceHash, RenderedFilesMapSchema } from "@axm.sh/core/unstable/extensions";
import { emitPlanResolutionResult } from "../../../json-output.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RenameSubagentHandlerArgs {
  /** Current name of the subagent */
  readonly oldName: string;
  /** New name for the subagent */
  readonly newName: string;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Derive a SubagentPathSource from a lock entry type (non-registry only). */
const lockEntryToPathSource = (lockEntry: SubagentLockEntry): SubagentPathSource =>
  lockEntry.type === "local" ? { refType: "local" } : { refType: "git-hosted" };

/** Update the `name` field in a SUBAGENT.md's YAML frontmatter. */
const updateSubagentMdName = (fs: FileSystem.FileSystem, subagentMdPath: string, newName: string) =>
  Effect.gen(function* () {
    const content = yield* fs.readFileString(subagentMdPath);
    const parsed = matter(content);
    if (typeof parsed.data["name"] !== "string") return;
    parsed.data["name"] = newName;
    yield* fs.writeFileString(subagentMdPath, matter.stringify(parsed.content, parsed.data));
  });

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleRenameSubagent = Effect.fn("RenameSubagent.handle")(function* (
  args: RenameSubagentHandlerArgs,
) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm subagents rename");

  // Look up subagent in lockfile
  const lockEntryOption = yield* ws.getLockedSubagent(args.oldName);

  if (Option.isNone(lockEntryOption)) {
    return yield* makeAppError({
      code: "SUBAGENT_NOT_FOUND",
      what: `Subagent '${args.oldName}' not found`,
      howToFix: "Run `axm subagents list` to see available subagents",
    });
  }

  const lockEntry = lockEntryOption.value;

  // Reject registry-installed subagents
  if (lockEntry.type === "registry") {
    return yield* makeAppError({
      code: "SUBAGENT_RENAME_NOT_ALLOWED",
      what: `Subagent '${args.oldName}' is registry-installed and cannot be renamed`,
      howToFix: "Only locally-authored subagents can be renamed",
    });
  }

  // Reject pack-installed subagents
  const lockedPacks = yield* ws.getLockedExtensionPacks();
  for (const [packName, packEntry] of Object.entries(lockedPacks)) {
    const { resolvedSubagents } = packEntry;
    if (args.oldName in resolvedSubagents) {
      return yield* makeAppError({
        code: "SUBAGENT_RENAME_NOT_ALLOWED",
        what: `Subagent '${args.oldName}' is installed via pack '${packName}' and cannot be renamed`,
        howToFix: "Only locally-authored subagents can be renamed",
      });
    }
  }

  // Check new name doesn't conflict
  const newLockEntryOption = yield* ws.getLockedSubagent(args.newName);
  if (Option.isSome(newLockEntryOption)) {
    return yield* makeAppError({
      code: "SUBAGENT_NAME_CONFLICT",
      what: `Subagent '${args.newName}' already exists`,
      howToFix: "Choose a different name or uninstall the existing subagent first",
    });
  }

  // Build layer for providing deps into agent rendering
  const fsPathLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );

  // Build the rename step — capture all deps from handler scope
  const renameStep: PlannedJobStep = {
    readiness: "ready",
    label: `${args.oldName} -> ${args.newName}`,
    run: Effect.gen(function* () {
      const baseDir = ws.baseDir;
      const pathSource = lockEntryToPathSource(lockEntry);
      const oldSanitized = sanitizeName(args.oldName);
      const newSanitized = sanitizeName(args.newName);
      const oldPaths = computeSubagentPaths(path.join, baseDir, pathSource, oldSanitized);
      const newPaths = computeSubagentPaths(path.join, baseDir, pathSource, newSanitized);

      // 1. Rename canonical directory
      yield* fs.rename(oldPaths.canonicalPath, newPaths.canonicalPath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "RENAME_SUBAGENT_DIR_FAILED",
            what: `Failed to rename subagent directory from "${args.oldName}" to "${args.newName}"`,
            cause: e,
          }),
        ),
      );

      // 2. Update SUBAGENT.md frontmatter name — best-effort
      yield* updateSubagentMdName(
        fs,
        path.join(newPaths.subagentSrcPath, SUBAGENT_CONTENT_FILENAME),
        args.newName,
      ).pipe(Effect.catch(() => Effect.void));

      // 3. Remove old rendered files
      const renderedFiles = lockEntry.renderedFiles ?? {};
      const configuredAgents = yield* agentRepo
        .getConfiguredAgents()
        .pipe(Effect.provideService(Workspace, ws));

      yield* Effect.forEach(
        configuredAgents,
        (agent) => {
          const agentFiles = renderedFiles[agent.id] ?? [];
          return agent
            .removeSubagent({
              workspaceRoot: baseDir,
              scope: "project",
              subagentName: args.oldName,
              renderedFilePaths: agentFiles.map((f) => f.path),
            })
            .pipe(Effect.provide(fsPathLayer));
        },
        { concurrency: "unbounded" },
      );

      // 4. Read updated SUBAGENT.md and re-render with new name
      const contentPath = path.join(newPaths.subagentSrcPath, SUBAGENT_CONTENT_FILENAME);
      const rawContent = yield* fs.readFileString(contentPath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "SUBAGENT_CONTENT_READ_FAILED",
            what: `Failed to read ${SUBAGENT_CONTENT_FILENAME} from ${newPaths.subagentSrcPath}`,
            cause: error,
          }),
        ),
      );
      const parsed = yield* parseSubagentMd(rawContent);
      const currentHash = computeSourceHash(rawContent);
      const frontmatter = Option.getOrUndefined(parsed.frontmatter);

      const newRenderedFilesMap: Record<string, Array<{ path: string }>> = {};

      yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .addSubagent({
              workspaceRoot: baseDir,
              scope: "project",
              input: {
                agentId: agent.id,
                name: args.newName,
                description: frontmatter?.description ?? "",
                model: frontmatter?.model,
                toolAccess: frontmatter?.toolAccess,
                background: frontmatter?.background,
                body: parsed.body,
                agentOverrides: frontmatter?.overrides,
              },
              force: false,
            })
            .pipe(
              Effect.provide(fsPathLayer),
              Effect.map((outcome) => {
                if (outcome._tag === "success") {
                  newRenderedFilesMap[agent.id] = outcome.renderedFilePaths.map((p) => ({
                    path: p,
                  }));
                }
              }),
            ),
        { concurrency: "unbounded" },
      );

      // 5. Update settings + lockfile: remove old, add new
      const decodeRenderedFiles = Schema.decodeUnknownSync(RenderedFilesMapSchema);
      const newLockEntry = {
        ...lockEntry,
        sourceHash: currentHash,
        renderedFiles: decodeRenderedFiles(newRenderedFilesMap),
      };

      yield* ws.removeSubagentSettings(args.oldName).pipe(Effect.catch(() => Effect.void));
      yield* ws.removeSubagentLock(args.oldName).pipe(Effect.catch(() => Effect.void));

      yield* ws.setSubagentLock({ name: args.newName, lockEntry: newLockEntry });
      yield* ws
        .updateSubagentEntry(args.newName, (e) => ({ ...e, enabled: true }))
        .pipe(
          Effect.catch(() =>
            ws.setSubagentEntry(args.newName, {
              source: lockEntry.type === "local" ? lockEntry.path : "local",
              enabled: true,
            }),
          ),
        );

      return {
        result: "success",
        message: `Renamed ${args.oldName} to ${args.newName}`,
      } satisfies JobStepResult;
    }),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "Rename subagent",
    description: Option.some(`Rename ${args.oldName} to ${args.newName}`),
    jobs: [{ concurrency: 1 as const, steps: [renameStep] }],
  };

  const resolution = yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("subagents.rename", resolution);

  yield* renderer.success("Done");
});
