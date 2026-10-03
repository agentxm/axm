/**
 * Shared subagent sync helpers for coding-agent service implementations.
 *
 * Provides common logic for writing and removing subagent files in agent
 * subagents directories. Each agent adapter delegates to these helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { parseFrontmatterSync } from "@agentxm/extension-content";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { assertNativeMutationWithinRoots, resolveNativeReferent } from "../../locations/index.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { SubagentIoFailed, type CodingAgentFailure } from "../errors.js";
import { NativeWriteAuthority, type NativeWriteRefused } from "../native-write-authority.js";
import { markerForFile, commentStyleForTarget } from "../managed-markers.js";
import { renderSubagent } from "./rendering/index.js";
import type {
  AddSubagentArgs,
  RemoveSubagentArgs,
  ResolveSubagentsDirOutcome,
  SubagentSyncOutcome,
} from "../agents/coding-agent.js";

export const nativeSubagentMarker = (content: string, filePath: string) => {
  const style = commentStyleForTarget(filePath);
  if (Option.isNone(style)) return Option.none();
  const parsed = filePath.endsWith(".md") ? parseFrontmatterSync(content) : undefined;
  const body = parsed?.frontmatter === undefined ? content : parsed.body;
  return markerForFile(body, style.value);
};

const ownsNativeSubagent = (
  content: string,
  filePath: string,
  expected: { readonly ext: string; readonly src: string } | undefined,
): boolean => {
  if (expected === undefined) return false;
  const marker = nativeSubagentMarker(content, filePath);
  return (
    Option.isSome(marker) && marker.value.ext === expected.ext && marker.value.src === expected.src
  );
};

/** Failures the shared subagent sync helpers raise. */
export type SubagentSyncFailure = SubagentIoFailed | NativeWriteRefused;

/**
 * Write rendered subagent files to an agent's subagents directory.
 *
 * Handles directory creation and file writing.
 * Returns a `SubagentSyncOutcome` with the rendered file paths and any warnings.
 */
export const writeSubagentFiles = (
  subagentsDir: string,
  args: AddSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  SubagentSyncFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;

    const descriptor = isConfigurableAgentId(args.input.agentId)
      ? AGENT_DESCRIPTORS[args.input.agentId].subagents
      : undefined;
    if (
      descriptor?.locations.some(
        (location) => location.scope === args.scope && location.shape === "file",
      ) === true ||
      args.input.agentId === "kiro-cli" ||
      args.input.agentId === "kiro"
    )
      return {
        _tag: "unsupported",
        reason: `Native Subagent ownership proof is not supported for ${args.input.agentId}`,
      } as const;
    // Render filenames; the supplied catalog location alone owns placement.
    const renderResult = renderSubagent(args.input);
    if (renderResult === undefined) {
      return {
        _tag: "unsupported",
        reason: `Subagent rendering not supported for ${args.input.agentId}`,
      } as const;
    }
    if (renderResult._tag === "Skipped") {
      return {
        _tag: "skipped",
        reason: renderResult.reason,
      } as const;
    }

    const resolvedOutputs = yield* Effect.forEach(
      renderResult.outputs,
      (output) =>
        assertNativeMutationWithinRoots(
          args.nativeRoots ?? [args.workspaceRoot],
          path.resolve(subagentsDir, output.path),
          "content",
          args.workspaceRoot,
        ).pipe(
          Effect.map(({ address }) => ({
            output,
            filePath: address.referentPath ?? address.entryPath,
          })),
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({ detail: "Cannot resolve physical Subagent output", cause }),
          ),
        ),
      { concurrency: 1 },
    );

    const eligibleDirectory =
      args.nativeInsertionEligiblePaths?.has(
        yield* resolveNativeReferent(subagentsDir).pipe(
          Effect.mapError(
            (cause) =>
              new SubagentIoFailed({
                detail: "Cannot resolve Subagent publication directory",
                cause,
              }),
          ),
        ),
      ) === true;
    const renderedFilePaths: Array<string> = [];
    const nativeTargets: Array<{
      path: string;
      kind: "subagent";
      change: "created" | "updated" | "unchanged";
    }> = [];
    for (const { output, filePath } of resolvedOutputs) {
      const conflict = yield* authority.withExclusiveWrite(
        filePath,
        Effect.gen(function* () {
          const { address } = yield* assertNativeMutationWithinRoots(
            args.nativeRoots ?? [args.workspaceRoot],
            filePath,
            "content",
            args.workspaceRoot,
          ).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({ detail: `Unsafe Subagent output: ${filePath}`, cause }),
            ),
          );
          if (address.kind !== "absent" && address.kind !== "file")
            return {
              _tag: "conflict",
              reason: `Preserved unowned Subagent entry: ${filePath}`,
            } as const;
          const prior = yield* fs.readFileString(filePath).pipe(Effect.option);
          const expectedMarker = Option.getOrUndefined(
            nativeSubagentMarker(output.content, filePath),
          );
          if (
            Option.isSome(prior) &&
            !ownsNativeSubagent(prior.value, filePath, expectedMarker) &&
            !args.previousManagedFiles.some((expected) =>
              ownsNativeSubagent(prior.value, filePath, expected),
            )
          )
            return {
              _tag: "conflict",
              reason: `Preserved unowned Subagent file: ${filePath}`,
            } as const;
          if (Option.isSome(prior)) {
            const marker = nativeSubagentMarker(prior.value, filePath);
            // The owner stamps authoritative render inputs in gen. Preserve
            // accepted body edits whenever those inputs have not changed.
            const current =
              expectedMarker?.generation !== undefined &&
              Option.isSome(marker) &&
              marker.value.ext === expectedMarker.ext &&
              marker.value.src === expectedMarker.src &&
              marker.value.generation === expectedMarker.generation;
            if (current || prior.value === output.content)
              return { _tag: "written", change: "unchanged" } as const;
          }
          const capture = yield* authority.captureCreatedDirectories({
            path: filePath,
            unit: JSON.stringify(["subagent-parent-directories", filePath]),
            eligible: args.nativeInsertionEligible === true || eligibleDirectory,
          });
          yield* authority.protect(filePath);
          const createdDirectories = yield* authority.createParentDirectories(filePath);
          yield* fs.writeFileString(filePath, output.content).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({
                  detail: `Failed to write subagent file: ${filePath}`,
                  cause,
                }),
            ),
          );
          yield* authority.record({
            path: filePath,
            change: Option.isSome(prior) ? "modified" : "created",
          });
          yield* authority.recordCreatedDirectories({ capture, createdDirectories });
          return { _tag: "written", change: Option.isSome(prior) ? "updated" : "created" } as const;
        }),
      );
      if (conflict._tag === "conflict") return conflict;
      nativeTargets.push({ path: filePath, kind: "subagent", change: conflict.change });
      renderedFilePaths.push(filePath);
    }

    return {
      _tag: "success",
      nativeTargets,
      renderedFilePaths,
      warnings: renderResult.warnings.map((w) => `[${w.agent}] ${w.feature}: ${w.message}`),
    } as const;
  });

/**
 * Remove subagent files from an agent's subagents directory.
 *
 * Handles file-not-found gracefully.
 */
export const removeSubagentFiles = (
  args: RemoveSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  SubagentSyncFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;

    const removedPaths: Array<string> = [];
    for (const renderedPath of args.renderedFilePaths) {
      const { address } = yield* assertNativeMutationWithinRoots(
        args.nativeRoots ?? [args.workspaceRoot],
        path.resolve(args.workspaceRoot, renderedPath),
        "content",
        args.workspaceRoot,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new SubagentIoFailed({ detail: `Unsafe Subagent removal: ${renderedPath}`, cause }),
        ),
      );
      const filePath = address.referentPath ?? address.entryPath;
      const removed = yield* authority.withExclusiveWrite(
        filePath,
        Effect.gen(function* () {
          const { address: current } = yield* assertNativeMutationWithinRoots(
            args.nativeRoots ?? [args.workspaceRoot],
            filePath,
            "content",
            args.workspaceRoot,
          ).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({ detail: `Unsafe Subagent removal: ${filePath}`, cause }),
            ),
          );
          if (current.kind !== "file") return false;
          const raw = yield* fs.readFileString(filePath).pipe(Effect.option);
          if (
            Option.isNone(raw) ||
            !ownsNativeSubagent(raw.value, filePath, args.expectedManagedFile)
          )
            return false;
          yield* authority.protect(filePath);
          yield* fs.remove(filePath).pipe(
            Effect.mapError(
              (cause) =>
                new SubagentIoFailed({
                  detail: `Failed to remove subagent file: ${filePath}`,
                  cause,
                }),
            ),
          );
          yield* authority.record({ path: filePath, change: "removed" });
          yield* authority.retireCreatedDirectories({
            path: filePath,
            unit: JSON.stringify(["subagent-parent-directories", filePath]),
          });
          return true;
        }),
      );
      if (removed) removedPaths.push(filePath);
    }

    return {
      _tag: "success",
      renderedFilePaths: removedPaths,
      warnings: [],
    } as const;
  });

/**
 * Convert a non-supported ResolveSubagentsDirOutcome to a SubagentSyncOutcome.
 */
export const dirOutcomeToSubagentSyncOutcome = (
  outcome: Exclude<ResolveSubagentsDirOutcome, { readonly _tag: "supported" }>,
): SubagentSyncOutcome => ({
  _tag: "unsupported",
  reason: outcome.reason,
});

/**
 * Add a subagent using a resolve function.
 *
 * Common pattern used by most agent adapters.
 */
export const addSubagentViaResolve = (
  resolve: Effect.Effect<
    ResolveSubagentsDirOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path
  >,
  args: AddSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSubagentSyncOutcome(dirOutcome);
    }
    return yield* writeSubagentFiles(dirOutcome.dir, args);
  });

/**
 * Remove a subagent using a resolve function.
 *
 * Common pattern used by most agent adapters.
 */
export const removeSubagentViaResolve = (
  resolve: Effect.Effect<
    ResolveSubagentsDirOutcome,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path
  >,
  args: RemoveSubagentArgs,
): Effect.Effect<
  SubagentSyncOutcome,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const dirOutcome = yield* resolve;
    if (dirOutcome._tag !== "supported") {
      return dirOutcomeToSubagentSyncOutcome(dirOutcome);
    }
    return yield* removeSubagentFiles(args);
  });
