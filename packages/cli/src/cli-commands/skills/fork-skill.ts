/**
 * Fork skill executor — copies source files to the managed extensions store
 * and generates an `axm-skill.json` manifest.
 *
 * Pipeline: parse target name → resolve source path → copy files →
 * generate manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import { OperationError, type OperationHandler } from "../../workspace/apply-plan.js";
import type { OperationResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service.js";
import { copySkillDirectory } from "./copy-skill-directory.js";
import type { ForkSkillOperation } from "./operations.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const REGISTRY_EXTENSIONS_DIR = ".axm/extensions";
const MANIFEST_FILENAME = "axm-skill.json";
const DEFAULT_VERSION = "0.1.0";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Parse `@scope/name` into its parts.
 */
const parseTargetName = (targetName: string): { readonly scope: string; readonly name: string } => {
  const slashIdx = targetName.indexOf("/");
  return {
    scope: targetName.slice(0, slashIdx),
    name: targetName.slice(slashIdx + 1),
  };
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Fork-skill operation handler.
 *
 * 1. Parse target name (`@scope/name`)
 * 2. Resolve source path from location
 * 3. Copy files to `.axm/extensions/@<scope>/skills/<name>/`
 * 4. Generate `axm-skill.json` manifest with defaults
 */
export const forkSkill: OperationHandler<
  ForkSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = path.dirname(ws.path);

    const { scope, name } = parseTargetName(op.args.targetName);

    // Target path in the managed extensions store
    const targetDir = path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "skills", name);

    // Source path from the location URL
    const sourcePath = op.args.location.replace("file://", "");

    // Copy source files to managed extensions store
    yield* copySkillDirectory(sourcePath, targetDir).pipe(
      Effect.mapError(
        (e) =>
          new OperationError({
            operation: "fork-skill",
            message: `Failed to copy skill files to ${targetDir}`,
            cause: e,
          }),
      ),
    );

    // Generate axm-skill.json manifest
    const manifest = {
      name: op.args.targetName,
      version: DEFAULT_VERSION,
      agents: [...op.args.agents],
      dependencies: {},
    };

    const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
    yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
      Effect.mapError(
        (e) =>
          new OperationError({
            operation: "fork-skill",
            message: `Failed to write manifest: ${manifestPath}`,
            cause: e,
          }),
      ),
    );

    return {
      result: "success",
      message: `Forked ${name} to ${op.args.targetName}`,
    } satisfies OperationResult;
  });
