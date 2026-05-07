/**
 * Shared helpers for command operations (install, enable, uninstall).
 *
 * Extracts duplicated logic into reusable functions:
 * - readCommandContent: parses the command's ${name}.md content file plus command.json
 * - renderToAgents: agent rendering + result collection
 * - checkInstalledOnDisk: scan disk for installed command files
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../app-error/index.js";
import { parseCommandMd, type CommandContentResult } from "../command-content.js";
import { COMMAND_MANIFEST_FILENAME, CommandManifestSchema } from "../manifest-schema.js";
import type { CommandManifest } from "../manifest-schema.js";
import { commandContentFilename } from "../paths.js";
import { selectRenderer } from "../renderers/index.js";
import type { RendererCommandFrontmatter } from "../renderers/types.js";
import type { LossyRenderingWarning } from "../rendering-warnings.js";
import type { CodingAgent, CommandSyncOutcome } from "../../agents/coding-agent.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { REGISTRY_EXTENSIONS_DIR, EXTERNAL_EXTENSIONS_DIR } from "../../extensions/index.js";
import { decodeExtensionNameSync, decodeHandleSync } from "../../extensions/index.js";
import { decodeExactSemverVersionSync } from "../../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// readCommandContent
// -----------------------------------------------------------------------------

/**
 * Error code prefix for parameterizing error codes across callers.
 */
export type CommandErrorPrefix = "INSTALL_COMMAND" | "ENABLE_COMMAND";

/**
 * Result of reading command content from a canonical directory.
 */
export interface ReadCommandContentResult extends CommandContentResult {
  readonly manifest: CommandManifest | undefined;
}

/**
 * Read the command content file (`${name}.md`) and `command.json` from a
 * canonical command directory.
 *
 * Parses the content file's frontmatter and reads/validates `command.json` if
 * present. The errorPrefix controls which error codes are used so callers
 * retain distinct error identities.
 */
export const readCommandContent = (
  canonicalPath: string,
  commandName: string,
  errorPrefix: CommandErrorPrefix,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Read the command content file (<name>.md)
    const contentFilename = commandContentFilename(commandName);
    const commandMdPath = path.join(canonicalPath, contentFilename);
    const commandMdExists = yield* fs
      .exists(commandMdPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    let frontmatter: CommandContentResult;
    if (commandMdExists) {
      const content = yield* fs.readFileString(commandMdPath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: `${errorPrefix}_READ_FAILED`,
            what: `Failed to read ${contentFilename} at ${commandMdPath}`,
            cause: e,
          }),
        ),
      );
      frontmatter = yield* parseCommandMd(content);
    } else {
      frontmatter = { frontmatter: Option.none(), body: "" };
    }

    // Read command.json
    const manifestPath = path.join(canonicalPath, COMMAND_MANIFEST_FILENAME);
    const manifestExists = yield* fs
      .exists(manifestPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    let manifest: CommandManifest | undefined;
    if (manifestExists) {
      const manifestContent = yield* fs.readFileString(manifestPath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: `${errorPrefix}_READ_FAILED`,
            what: `Failed to read ${COMMAND_MANIFEST_FILENAME} at ${manifestPath}`,
            cause: e,
          }),
        ),
      );
      manifest = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(CommandManifestSchema)(JSON.parse(manifestContent)),
        catch: (error) =>
          makeAppError({
            code: `${errorPrefix}_MANIFEST_INVALID`,
            what: `Invalid ${COMMAND_MANIFEST_FILENAME} at ${manifestPath}`,
            details: [error instanceof Error ? error.message : String(error)],
            cause: error,
          }),
      });
    }

    return { ...frontmatter, manifest } satisfies ReadCommandContentResult;
  });

// -----------------------------------------------------------------------------
// renderToAgents
// -----------------------------------------------------------------------------

/**
 * Args for rendering a command to configured agents.
 */
export interface RenderToAgentsArgs {
  readonly commandName: string;
  readonly frontmatter: CommandContentResult["frontmatter"];
  readonly body: string;
  readonly manifest: CommandManifest | undefined;
  /** Owner string for building an effective manifest when none exists. */
  readonly owner: string;
  readonly workspaceRoot: string;
  readonly force: boolean;
}

/**
 * Per-agent render outcome (success, skipped, unsupported, or conflict).
 */
export interface AgentRenderOutcome {
  readonly agentId: string;
  readonly outcome: CommandSyncOutcome;
  readonly warnings: ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Aggregated result of rendering a command to all configured agents.
 */
export interface RenderToAgentsResult {
  readonly outcomes: ReadonlyArray<AgentRenderOutcome>;
  readonly successfulAgents: ReadonlyArray<string>;
  readonly rawRenderedFiles: Record<string, Array<{ path: string }>>;
}

/**
 * Render a command to all configured agents concurrently.
 */
export const renderToAgents = (args: RenderToAgentsArgs) =>
  Effect.gen(function* () {
    const agentRepo = yield* CodingAgentRepository;

    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    // Build effective manifest
    const rendererFrontmatter: RendererCommandFrontmatter = Option.getOrElse(
      args.frontmatter,
      () => ({}),
    );
    const effectiveManifest: CommandManifest = args.manifest ?? {
      type: "command",
      name: decodeExtensionNameSync(args.commandName),
      owner: decodeHandleSync(args.owner),
      version: decodeExactSemverVersionSync("0.0.0"),
    };

    // Render to agents concurrently
    const outcomes = yield* Effect.forEach(
      configuredAgents,
      (agent: CodingAgent) => {
        const agentOverrides = args.manifest?.agentOverrides?.[agent.id];
        const rendererFn = selectRenderer(agent.id);
        const renderOutput = rendererFn({
          frontmatter: rendererFrontmatter,
          body: args.body,
          agentId: agent.id,
          commandName: args.commandName,
          ...(agentOverrides !== undefined ? { agentOverrides } : {}),
        });

        return agent
          .addCommand({
            workspaceRoot: args.workspaceRoot,
            scope: "project",
            commandName: args.commandName,
            frontmatter: args.frontmatter,
            body: renderOutput.content,
            manifest: effectiveManifest,
            agentOverrides: Option.fromUndefinedOr(agentOverrides),
            force: args.force,
          })
          .pipe(
            Effect.map((outcome) => ({
              agentId: agent.id,
              outcome,
              warnings: renderOutput.warnings,
            })),
            Effect.catch((err) => {
              const emptyWarnings: ReadonlyArray<LossyRenderingWarning> = [];
              return Effect.succeed({
                agentId: agent.id,
                outcome: {
                  _tag: "unsupported" as const,
                  reason: `Agent addCommand failed: ${err.what}`,
                },
                warnings: emptyWarnings,
              });
            }),
          );
      },
      { concurrency: "unbounded" },
    );

    // Collect results
    const successOutcomes = outcomes.flatMap((r) =>
      r.outcome._tag === "success" ? [{ agentId: r.agentId, outcome: r.outcome }] : [],
    );
    const successfulAgents = successOutcomes.map((r) => r.agentId);
    const rawRenderedFiles: Record<string, Array<{ path: string }>> = Object.fromEntries(
      successOutcomes.map((r) => [r.agentId, [{ path: r.outcome.renderedFilePath }]]),
    );

    return { outcomes, successfulAgents, rawRenderedFiles } satisfies RenderToAgentsResult;
  });

// -----------------------------------------------------------------------------
// checkInstalledOnDisk
// -----------------------------------------------------------------------------

/**
 * Check whether a command exists on disk in any known extension directory.
 *
 * Scans both registry extensions dirs (per-owner scope dirs under
 * `.axm/extensions/`) and the external extensions dir.
 */
export const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  commandName: string,
) =>
  Effect.gen(function* () {
    // Check registry extensions dirs
    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (extensionsDirExists) {
      const scopeDirs = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

      const results = yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.succeed(false);
          const cmdPath = pathService.join(extensionsDir, scopeDir, "commands", commandName);
          return fsService.exists(cmdPath).pipe(Effect.catch(() => Effect.succeed(false)));
        },
        { concurrency: "unbounded" },
      );

      if (results.some((exists) => exists)) return true;
    }

    // Check external extensions dir
    const externalPath = pathService.join(
      baseDir,
      EXTERNAL_EXTENSIONS_DIR,
      "commands",
      commandName,
    );
    return yield* fsService.exists(externalPath).pipe(Effect.catch(() => Effect.succeed(false)));
  });
