/**
 * New command operation -- scaffolds a new command directory with the manifest
 * and a `${name}.md` content file.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../app-error/index.js";
import {
  computeSourceHash,
  decodeExtensionNameSync,
  REGISTRY_EXTENSIONS_DIR,
} from "../../extensions/index.js";
import { RenderedFilesMapSchema } from "../../extensions/rendered-files.js";
import type { Handle } from "../../extensions/handle.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  COMMAND_MANIFEST_FILENAME,
  COMMAND_MANIFEST_SCHEMA_URL,
  type CommandManifest,
} from "../manifest-schema.js";
import { commandContentFilename } from "../paths.js";
import { decodeExactSemverVersionSync } from "../../version-constraints/version-constraints.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { parseCommandMd } from "../command-content.js";
import { renderToAgents } from "./shared-command-helpers.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

const decodeRenderedFilesMap = Schema.decodeUnknownSync(RenderedFilesMapSchema);

/**
 * Args for the new-command operation.
 */
export interface NewCommandOperationArgs {
  /** Command name (validated, lowercase with hyphens). */
  readonly name: string;
  /** Profile (e.g., "@myorg"). */
  readonly owner: Handle;
  /** Description for the command. */
  readonly description: string;
  /** Overwrite existing rendered command files. */
  readonly force: boolean;
}

/**
 * Scaffold a new command in the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NewCommandOperation = Operation<"new-command", NewCommandOperationArgs>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeCommandMd = (name: string, description: string) =>
  `---
name: ${name}
description: ${description || "A new command"}
---

Describe what this command does and how to use it.
`;

const INITIAL_COMMAND_VERSION = decodeExactSemverVersionSync("0.1.0");

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * New-command operation handler.
 *
 * 1. Compute managed extension directory path
 * 2. Check if directory already exists
 * 3. Create the managed extension + src directories
 * 4. Write command.json manifest
 * 5. Write starter `${name}.md` in src/
 */
export const newCommand: OperationHandler<
  NewCommandOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const { name, owner, description, force } = op.args;

    // 1. Compute managed extension directory
    const targetDir = path.join(
      path.resolve("."),
      REGISTRY_EXTENSIONS_DIR,
      owner,
      "commands",
      name,
    );
    const srcDir = path.join(targetDir, "src");

    // 2. Check if directory already exists
    const dirExists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));

    if (dirExists) {
      return yield* makeAppError({
        code: "COMMAND_DIR_EXISTS",
        category: "conflict",
        what: `Directory "${name}" already exists`,
        breadcrumbs: [
          {
            task: "Recover",
            description: "Choose a different name or remove the existing directory first",
          },
        ],
      });
    }

    // 3. Create managed extension directories
    yield* fs.makeDirectory(srcDir, { recursive: true }).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "COMMAND_CREATE_FAILED",
          category: "internal",
          what: `Failed to create command directory: ${targetDir}`,
          cause: e,
        }),
      ),
    );

    // 4. Write manifest
    const manifest: CommandManifest = {
      $schema: COMMAND_MANIFEST_SCHEMA_URL,
      owner,
      type: "command",
      name: decodeExtensionNameSync(name),
      version: INITIAL_COMMAND_VERSION,
      description: description || undefined,
    };

    yield* fs
      .writeFileString(
        path.join(targetDir, COMMAND_MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2) + "\n",
      )
      .pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "COMMAND_CREATE_FAILED",
            category: "internal",
            what: `Failed to write command manifest`,
            cause: e,
          }),
        ),
      );

    // 5. Write starter content file (<name>.md) in src/
    const contentFilename = commandContentFilename(name);
    const commandMdContent = makeCommandMd(name, description);
    yield* fs.writeFileString(path.join(srcDir, contentFilename), commandMdContent).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "COMMAND_CREATE_FAILED",
          category: "internal",
          what: `Failed to write ${contentFilename}`,
          cause: e,
        }),
      ),
    );

    const { frontmatter, body } = yield* parseCommandMd(commandMdContent);
    const { successfulAgents, rawRenderedFiles } = yield* renderToAgents({
      commandName: name,
      frontmatter,
      body,
      manifest,
      owner,
      workspaceRoot: ws.baseDir,
      force,
    });

    const fqn = `${owner}/commands/${name}`;
    yield* ws.setCommandEntry(name, {
      source: fqn,
      enabled: true,
      authored: true,
    });

    const now = new Date();
    const lockEntry: CommandLockEntry = {
      type: "registry",
      owner,
      name: decodeExtensionNameSync(name),
      resolvedVersion: INITIAL_COMMAND_VERSION,
      integrity: "",
      sourceName: "local",
      agents: successfulAgents,
      installedAt: now,
      updatedAt: now,
      sourceHash: computeSourceHash(body),
      renderedFiles: decodeRenderedFilesMap(rawRenderedFiles),
    };
    yield* ws.setCommandLock({ name, lockEntry });

    return {
      result: "success",
      message: `Created command ${fqn}`,
    } satisfies JobStepResult;
  });
