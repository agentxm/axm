/**
 * Enable command executor — re-renders command to agents for a previously disabled command.
 *
 * Enabling requires usable trusted canonical content. Receipts are not consulted:
 * they are optional post-success history, not an input to lifecycle decisions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Operation,
  JobStepResult,
} from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { RenderedFilesMapSchema, type RenderedFilesMap } from "../../extensions/rendered-files.js";
import { parseExtensionFqnParts } from "../../extensions/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { makeWorkspaceRelativeSourcePath } from "../../utils/path-types.js";
import {
  collectRenderingWarningSummaries,
  readCommandContent,
  renderToAgents,
} from "./shared-command-helpers.js";
import { usableTrustedCanonicalObservation } from "../../workspace/trusted-canonical-ref.js";

const decodeRenderedFilesMap = Schema.decodeUnknownSync(RenderedFilesMapSchema);

const renderedFileTargets = (
  renderedFiles: RenderedFilesMap,
): ReadonlyArray<JobStepArtifactTarget> => {
  if (renderedFiles === undefined) return [];

  const agentIdsByPath = new Map<string, Array<string>>();
  for (const [agentId, files] of Object.entries(renderedFiles)) {
    for (const file of files) {
      const agentIds = agentIdsByPath.get(file.path) ?? [];
      if (!agentIds.includes(agentId)) {
        agentIds.push(agentId);
      }
      agentIdsByPath.set(file.path, agentIds);
    }
  }

  return Array.from(agentIdsByPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([targetPath, agentIds]): JobStepArtifactTarget => ({
      path: targetPath,
      change: "updated",
      agentIds: [...agentIds].sort(),
    }));
};

const commandArtifact = (
  version: string | undefined,
  scope: JobStepArtifact["scope"],
  agents: ReadonlyArray<string>,
  renderedFiles: RenderedFilesMap,
): JobStepArtifact => {
  const targets = renderedFileTargets(renderedFiles);
  const firstTarget = targets[0];
  return {
    path: firstTarget?.path ?? ".axm/settings.json",
    scope,
    ...(agents.length === 0 ? {} : { agents }),
    ...(version === undefined ? {} : { version }),
    change: "updated",
    ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
  };
};

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Enable a previously disabled command (re-render files and update state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EnableCommandOperation = Operation<"enable-command", { readonly commandName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-command operation handler.
 *
 * 1. Resolve usable canonical content from desired state, trust, and observation.
 * 2. Read the command content and manifest.
 * 3. Render to configured agents.
 * 4. Update settings to set enabled: true.
 */
export const enableCommand: OperationHandler<
  EnableCommandOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    const canonical = yield* usableTrustedCanonicalObservation({
      workspace: ws,
      type: "command",
      name: op.args.commandName,
    });
    if (Option.isNone(canonical)) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Trusted command content for "${op.args.commandName}" is not usable`,
        suggestions: [
          {
            description: "Try reinstalling the command.",
            cmd: "axm commands install <source>",
          },
        ],
      });
    }
    const canonicalPath = canonical.value.observation.path;

    // Read the command content file and command.json
    const { frontmatter, agentOverrides, body, manifest, contentPath } = yield* readCommandContent(
      canonicalPath,
      op.args.commandName,
      "ENABLE_COMMAND",
    );
    const editSourcePath = makeWorkspaceRelativeSourcePath(path, base, contentPath);
    if (Option.isNone(editSourcePath)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Command source path escapes workspace root: ${contentPath}`,
      });
    }

    const trust = canonical.value.trust;
    const identity =
      trust.authority === "workspace"
        ? trust.sourceIdentity.slice("workspace:".length)
        : trust.sourceIdentity;
    const trustedIdentity =
      trust.authority === "registry" || trust.authority === "workspace"
        ? parseExtensionFqnParts(identity)
        : undefined;
    const owner =
      trustedIdentity?.type === "command"
        ? trustedIdentity.owner
        : yield* ws.getConfiguredOwner().pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    makeAppError({
                      code: "internal",
                      detail: `Cannot re-render non-registry command "${op.args.commandName}" without a configured owner`,
                      suggestions: [
                        {
                          description:
                            "Set `owner` in `.axm/settings.json` (project or global) to enable non-registry commands.",
                        },
                      ],
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          );

    // Render to agents concurrently
    const { outcomes, successfulAgents, rawRenderedFiles } = yield* renderToAgents({
      commandName: op.args.commandName,
      editSourcePath: editSourcePath.value,
      frontmatter,
      agentOverrides: Option.getOrUndefined(agentOverrides),
      body,
      manifest,
      owner,
      workspaceRoot: base,
      force: false,
    });
    const renderingWarnings = collectRenderingWarningSummaries(outcomes);
    const renderedFiles = decodeRenderedFilesMap(rawRenderedFiles);

    // Update settings entry to enabled (collapsed to string form)
    yield* ws
      .updateCommandEntry(op.args.commandName, (entry) => ({
        ...entry,
        enabled: true,
      }))
      .pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Enabled ${op.args.commandName}`,
      ...(renderingWarnings.length === 0 ? {} : { warnings: renderingWarnings }),
      artifact: commandArtifact(
        canonical.value.trust.resolvedVersion,
        ws.scope,
        successfulAgents,
        renderedFiles,
      ),
    } satisfies JobStepResult;
  });
