/**
 * Enable subagent executor — re-renders agent-native files for a previously disabled subagent.
 *
 * Enabling requires canonical content backed by a usable accepted resolution.
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
import { surfaceRestorationIncomplete } from "../../workspace/transaction.js";
import { RenderedFilesMapSchema } from "../../extensions/rendered-files.js";
import { makeWorkspaceRelativePath } from "../../utils/path-types.js";
import { subagentContentFilename, subagentContentPath } from "../paths.js";
import { parseSubagentMd } from "@agentxm/registry-protocol/unstable/content/subagent-content";
import { subagentContentErrorToAppError } from "../../app-error/conversions.js";
import { warnOnOrphanOverrides } from "../rendering/overrides.js";
import { subagentLifecycleArtifact } from "./artifact.js";
import { usableAcceptedCanonical } from "../../workspace/accepted-canonical-ref.js";
import { managedSubagentFile } from "../managed-file.js";

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
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-subagent operation handler.
 *
 * Resolves accepted canonical content, renders to configured agents, and then
 * updates the desired settings entry.
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

    const canonical = yield* usableAcceptedCanonical({
      workspace: ws,
      type: "subagent",
      name: op.args.subagentName,
    });
    if (Option.isNone(canonical) || canonical.value.ref.type !== "subagent") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Accepted subagent content for "${op.args.subagentName}" is not usable`,
        suggestions: [
          {
            description: "Try reinstalling the subagent.",
            cmd: "axm subagents install <source>",
          },
        ],
      });
    }

    const baseDir = ws.baseDir;
    const subagentSrcPath =
      canonical.value.ref.refType === "registry" || canonical.value.ref.refType === "workspace"
        ? path.join(canonical.value.observation.path, "src")
        : canonical.value.observation.path;

    // Read and parse the subagent content file
    const expectedFilename = subagentContentFilename(op.args.subagentName);
    const contentPath = subagentContentPath(path.join, subagentSrcPath, op.args.subagentName);
    const sourcePath = makeWorkspaceRelativePath(path, baseDir, contentPath);
    if (Option.isNone(sourcePath)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Subagent source path escapes workspace root: ${contentPath}`,
      });
    }
    const managedFile = managedSubagentFile(canonical.value.ref, sourcePath.value);
    const rawContent = yield* fs.readFileString(contentPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read ${expectedFilename} from ${subagentSrcPath}`,
          suggestions: [
            {
              description: `Ensure the subagent content file exists at ${contentPath}.`,
            },
          ],
          cause: error,
        }),
      ),
    );
    const parsed = yield* parseSubagentMd(rawContent, op.args.subagentName).pipe(
      Effect.mapError(subagentContentErrorToAppError),
    );
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

    yield* ws
      .runTransaction({
        transition: Effect.gen(function* () {
          yield* Effect.forEach(
            configuredAgents,
            (agent) =>
              agent
                .addSubagent({
                  workspaceRoot: baseDir,
                  scope: ws.scope,
                  managedFile,
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
                  Effect.flatMap((outcome) => {
                    if (outcome._tag === "conflict") {
                      return makeAppError({
                        code: "conflict",
                        detail: `Subagent rendering failed for ${agent.id}: ${outcome.reason}`,
                      });
                    }
                    if (outcome._tag !== "success") return Effect.void;
                    return Effect.forEach(outcome.renderedFilePaths, (renderedPath) => {
                      const relativePath = makeWorkspaceRelativePath(path, baseDir, renderedPath);
                      if (Option.isNone(relativePath)) {
                        return Effect.fail(
                          makeAppError({
                            code: "internal",
                            detail: `Rendered subagent path escapes workspace root: ${renderedPath}`,
                          }),
                        );
                      }
                      return Effect.succeed({ path: relativePath.value });
                    }).pipe(
                      Effect.map((entries) => {
                        renderedFilesMap[agent.id] = entries;
                      }),
                    );
                  }),
                ),
            { concurrency: "unbounded" },
          );
          yield* ws.updateSubagentEntry(op.args.subagentName, (entry) => ({
            ...entry,
            enabled: true,
          }));
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
        validate: () => Effect.void,
      })
      .pipe(surfaceRestorationIncomplete);

    const decodeRenderedFiles = Schema.decodeUnknownSync(RenderedFilesMapSchema);
    const renderedFiles = decodeRenderedFiles(renderedFilesMap);

    const version =
      canonical.value.accepted?.type === "registry"
        ? canonical.value.accepted.resolvedVersion
        : undefined;

    return {
      result: "success",
      message: `Enabled ${op.args.subagentName}`,
      artifact: subagentLifecycleArtifact({
        name: op.args.subagentName,
        scope: ws.scope,
        agents: configuredAgents.map((agent) => agent.id),
        ...(version === undefined ? {} : { version }),
        change: "updated",
        renderedFiles,
        renderedChange: "updated",
      }),
    } satisfies JobStepResult;
  });
