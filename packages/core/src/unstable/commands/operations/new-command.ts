/**
 * New command operation -- scaffolds a new command directory with the manifest
 * and a `${name}.md` content file.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../app-error/index.js";
import {
  decodeExtensionNameSync,
  preflightCreateOnly,
  REGISTRY_EXTENSIONS_DIR,
} from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import {
  COMMAND_MANIFEST_FILENAME,
  COMMAND_MANIFEST_SCHEMA_URL,
  type CommandManifest,
} from "../manifest-schema.js";
import { commandContentFilename } from "../paths.js";
import { decodeVersionSync } from "../../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

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

const INITIAL_COMMAND_VERSION = decodeVersionSync("0.1.0");

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
  FileSystem.FileSystem | Path.Path
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const { name, owner, description } = op.args;

    // 1. Compute managed extension directory
    const targetDir = path.join(
      path.resolve("."),
      REGISTRY_EXTENSIONS_DIR,
      owner,
      "commands",
      name,
    );
    const srcDir = path.join(targetDir, "src");

    yield* preflightCreateOnly({
      subject: "Command",
      name,
      configured: false,
      destinations: [targetDir],
    });

    // 3. Create managed extension directories
    yield* fs.makeDirectory(srcDir, { recursive: true }).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "validation",
          detail: `Failed to create command directory: ${targetDir}`,
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
            code: "validation",
            detail: `Command manifest could not be written`,
            cause: e,
          }),
        ),
      );

    // 5. Write starter content file (<name>.md) in src/
    const contentFilename = commandContentFilename(name);
    const contentPath = path.join(srcDir, contentFilename);
    const commandMdContent = makeCommandMd(name, description);
    yield* fs.writeFileString(contentPath, commandMdContent).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "validation",
          detail: `Failed to write ${contentFilename}`,
          cause: e,
        }),
      ),
    );
    const fqn = `${owner}/commands/${name}`;

    return {
      result: "success",
      message: `Created command ${fqn}`,
    } satisfies JobStepResult;
  });
