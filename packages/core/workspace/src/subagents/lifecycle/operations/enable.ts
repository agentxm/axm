import * as Array from "effect/Array";
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
import { subagentContentFilename, subagentContentPath } from "../../../desired-state/index.js";
import {
  CodingAgentRepository,
  managedSubagentRenderInput,
  managedSubagentFile,
} from "../../../projection/index.js";
import {
  NativeWriteAuthority,
  warnOnOrphanOverrides,
} from "../../../projection/agent-adapters/index.js";
import { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import {
  StepFailureConversion,
  withAdaptedStepFailures,
} from "../../../lifecycle/step-failure-conversion.js";
import type { OperationHandler } from "../../../transitions/planning/index.js";
import type { Operation } from "../../../transitions/planning/index.js";
import type { JobStepResult } from "../../../transitions/planning/index.js";
import {
  type DesiredStateReader,
  type LockfileReader,
  type SettingsReader,
  WorkspaceLocation,
  SettingsWriter,
} from "../../../desired-state/index.js";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "../../../transitions/settlement/index.js";
import { makeWorkspaceRelativePath } from "@agentxm/extension-model/unstable/path-types";
import { parseSubagentMd } from "@agentxm/extension-content";
import { subagentLifecycleArtifact } from "./artifact.js";
import { usableAcceptedCanonical } from "../../../desired-state/index.js";

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
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | SettingsWriter
  | LockfileReader
  | DesiredStateReader
  | WorkspaceTransactionScope
  | CodingAgentRepository
  | NativeWriteAuthority
  | StepFailureConversion
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const settingsWriter = yield* SettingsWriter;
    const agentRepo = yield* CodingAgentRepository;

    const canonical = yield* usableAcceptedCanonical({
      type: "subagent",
      name: op.args.subagentName,
    });
    if (Option.isNone(canonical) || canonical.value.ref.type !== "subagent") {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `Accepted subagent content for "${op.args.subagentName}" is not usable`,
        suggestions: [
          {
            description: "Try reinstalling the subagent.",
            cmd: "axm subagents install <source>",
          },
        ],
      });
    }

    const baseDir = location.baseDir;
    const subagentSrcPath = path.join(canonical.value.observation.path, "src");

    // Read and parse the subagent content file
    const expectedFilename = subagentContentFilename(op.args.subagentName);
    const contentPath = subagentContentPath(path.join, subagentSrcPath, op.args.subagentName);
    const sourcePath = makeWorkspaceRelativePath(path, baseDir, contentPath);
    if (Option.isNone(sourcePath)) {
      return yield* new ExtensionLifecycleFailed({
        category: "internal",
        detail: `Subagent source path escapes workspace root: ${contentPath}`,
      });
    }
    const managedFile = managedSubagentFile(canonical.value.ref, sourcePath.value);
    const rawContent = yield* fs.readFileString(contentPath).pipe(
      Effect.mapError(
        (error) =>
          new ExtensionLifecycleFailed({
            category: "internal",
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
    const parsed = yield* parseSubagentMd(rawContent, op.args.subagentName).pipe();
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

    const renderedFiles = yield* runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        const rendered = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent
              .addSubagent({
                workspaceRoot: baseDir,
                scope: location.scope,
                input: managedSubagentRenderInput({
                  managedFile,
                  input: {
                    agentId: agent.id,
                    name: op.args.subagentName,
                    body: parsed.body,
                    frontmatter: renderFrontmatter,
                    agentOverrides: agentOverrides?.[agent.id],
                  },
                }),
                force: false,
              })
              .pipe(
                Effect.flatMap((outcome) => {
                  if (outcome._tag === "conflict") {
                    return new ExtensionLifecycleFailed({
                      category: "conflict",
                      detail: `Subagent rendering failed for ${agent.id}: ${outcome.reason}`,
                    });
                  }
                  if (outcome._tag !== "success") return Effect.succeed(Option.none());
                  return Effect.forEach(outcome.renderedFilePaths, (renderedPath) => {
                    const relativePath = makeWorkspaceRelativePath(path, baseDir, renderedPath);
                    if (Option.isNone(relativePath)) {
                      return Effect.fail(
                        new ExtensionLifecycleFailed({
                          category: "internal",
                          detail: `Rendered subagent path escapes workspace root: ${renderedPath}`,
                        }),
                      );
                    }
                    return Effect.succeed({ path: relativePath.value });
                  }).pipe(Effect.map((entries) => Option.some([agent.id, entries] as const)));
                }),
              ),
          { concurrency: 1 },
        );
        yield* settingsWriter.updateEntry("subagent", op.args.subagentName, (entry) => ({
          ...entry,
          enabled: true,
        }));
        return Object.fromEntries(Array.getSomes(rendered));
      }),
      validate: () => Effect.void,
    });

    const version =
      canonical.value.accepted?.source.type === "registry" &&
      "version" in canonical.value.accepted.resolved
        ? canonical.value.accepted.resolved.version
        : undefined;

    return {
      result: "success",
      message: `Enabled ${op.args.subagentName}`,
      artifact: subagentLifecycleArtifact({
        name: op.args.subagentName,
        scope: location.scope,
        agents: configuredAgents.map((agent) => agent.id),
        ...(version === undefined ? {} : { version }),
        change: "updated",
        renderedFiles,
        renderedChange: "updated",
      }),
    } satisfies JobStepResult;
  }).pipe(withAdaptedStepFailures);
