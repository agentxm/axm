import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { CodingAgentRepository } from "../agents/index.js";
import { WorkspaceMutations } from "./service-interface.js";

export const AXM_MANAGED_MARKER = "AXM managed";

export interface RenderedFileCleanupResult {
  readonly removedPaths: ReadonlyArray<string>;
}

const extensionNameFromFilename = (fileName: string): string => {
  const dotIndex = fileName.indexOf(".");
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
};

export const hasAxmManagedMarker = (content: string): boolean =>
  content.includes(AXM_MANAGED_MARKER) || content.includes("_axm_managed");

export const cleanupStaleManagedSubagentFiles = (args: {
  readonly expectedSubagentNames: ReadonlySet<string>;
}): Effect.Effect<
  RenderedFileCleanupResult,
  AppError,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const configuredAgentIds = new Set(yield* ws.getConfiguredAgents());
    const agents = yield* agentRepo.all;
    const removedPaths: Array<string> = [];

    for (const agent of agents) {
      const resolved = yield* agent.resolveEffectiveSubagentsDir({
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
      });
      if (resolved._tag !== "supported") continue;

      const exists = yield* fs.exists(resolved.dir).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) continue;

      const entries = yield* fs
        .readDirectory(resolved.dir)
        .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

      for (const entry of entries) {
        const filePath = path.join(resolved.dir, entry);
        const stat = yield* fs.stat(filePath).pipe(Effect.option);
        if (stat._tag === "None" || stat.value.type !== "File") continue;

        const content = yield* fs
          .readFileString(filePath)
          .pipe(Effect.catch(() => Effect.succeed("")));
        if (!hasAxmManagedMarker(content)) continue;

        const expected =
          configuredAgentIds.has(agent.id) &&
          args.expectedSubagentNames.has(extensionNameFromFilename(entry));
        if (expected) continue;

        yield* fs.remove(filePath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "SUBAGENT_SYNC_REMOVE_FAILED",
              category: "internal",
              message: `Failed to remove stale managed subagent file: ${filePath}`,
              cause: error,
            }),
          ),
        );
        removedPaths.push(filePath);
      }
    }

    return { removedPaths };
  });
