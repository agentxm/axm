/**
 * New hook operation — scaffolds a new hook directory with the manifest and a
 * starter entrypoint.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../app-error/index.js";
import {
  createCanonicalDirectory,
  recoverCanonicalDirectory,
  decodeExtensionNameSync,
  preflightCreateOnly,
  REGISTRY_EXTENSIONS_DIR,
} from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { decodeVersionSync } from "../../version-constraints/version-constraints.js";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HOOK_MANIFEST_SCHEMA_URL,
  type HookEvent,
  type HookManifest,
  type HookRuntime,
} from "../manifest-schema.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the new-hook operation.
 */
export interface NewHookOperationArgs {
  /** Hook name (validated, lowercase with hyphens). */
  readonly name: string;
  /** Owner (e.g., "@myorg"). */
  readonly owner: Handle;
  /** Interpreter family for the entrypoint. */
  readonly runtime: HookRuntime;
  /** Canonical hook event the scaffold binds to. */
  readonly event: HookEvent;
  /** Optional raw matcher (only meaningful for tool.pre/tool.post). */
  readonly matcher: string | undefined;
}

/**
 * Scaffold a new hook in the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NewHookOperation = Operation<"new-hook", NewHookOperationArgs>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const INITIAL_HOOK_VERSION = decodeVersionSync("0.1.0");

const entrypointFilename = (runtime: HookRuntime): string => {
  switch (runtime) {
    case "bash":
      return "hook.sh";
    case "node":
      return "hook.js";
    case "python":
      return "hook.py";
  }
};

const matcherForBinding = (event: HookEvent, matcher: string | undefined): string | undefined =>
  event === "tool.pre" || event === "tool.post" ? matcher : undefined;

const makeEntrypoint = (runtime: HookRuntime, fqn: string): string => {
  switch (runtime) {
    case "bash":
      return `#!/usr/bin/env bash
# ${fqn}
# Receives the agent hook event payload as JSON on stdin.
set -euo pipefail

payload="$(cat)"

# TODO: inspect "$payload" and implement the hook.
# Emit JSON on stdout or exit non-zero to influence the agent.
exit 0
`;
    case "node":
      return `#!/usr/bin/env node
// ${fqn}
// Receives the agent hook event payload as JSON on stdin.
let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const payload = raw ? JSON.parse(raw) : {};

  // TODO: inspect payload and implement the hook.
  // Emit JSON on stdout or exit non-zero to influence the agent.
  process.exit(0);
});
`;
    case "python":
      return `#!/usr/bin/env python3
"""${fqn}

Receives the agent hook event payload as JSON on stdin.
"""
import json
import sys

raw = sys.stdin.read()
payload = json.loads(raw) if raw else {}

# TODO: inspect payload and implement the hook.
# Emit JSON on stdout or exit non-zero to influence the agent.
sys.exit(0)
`;
  }
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * New-hook operation handler.
 *
 * 1. Compute managed extension directory path
 * 2. Check if the hook already exists (directory or settings entry)
 * 3. Create the managed extension + src directories
 * 4. Write hook.json manifest
 * 5. Write starter entrypoint in src/
 */
export const newHook: OperationHandler<
  NewHookOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    const { name, owner, runtime, event, matcher } = op.args;
    const fqn = `${owner}/${HOOK_EXTENSION_DIR}/${name}`;

    const configuredHooks = yield* ws.getConfiguredHookEntries();
    const canonicalPath = path.join(base, REGISTRY_EXTENSIONS_DIR, owner, HOOK_EXTENSION_DIR, name);
    yield* recoverCanonicalDirectory({ baseDir: base, canonicalPath });
    yield* preflightCreateOnly({
      subject: "Hook",
      name,
      configured: Object.hasOwn(configuredHooks, name),
      destinations: [canonicalPath],
    });

    const entrypointFile = entrypointFilename(runtime);
    const bindingMatcher = matcherForBinding(event, matcher);
    const manifest: HookManifest = {
      $schema: HOOK_MANIFEST_SCHEMA_URL,
      owner,
      type: "hook",
      name: decodeExtensionNameSync(name),
      version: INITIAL_HOOK_VERSION,
      runtime,
      entrypoint: `src/${entrypointFile}`,
      bindings: [
        bindingMatcher === undefined ? { on: event } : { on: event, matcherRaw: bindingMatcher },
      ],
    };

    yield* createCanonicalDirectory({
      baseDir: base,
      canonicalPath,
      subject: "Hook",
      requiredFiles: [HOOK_MANIFEST_FILENAME, `src/${entrypointFile}`],
      populate: (stagingPath) => {
        const srcDir = path.join(stagingPath, "src");
        return Effect.gen(function* () {
          yield* fs.makeDirectory(srcDir, { recursive: true }).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: `Failed to create hook directory: ${srcDir}`,
                cause: e,
              }),
            ),
          );
          yield* fs
            .writeFileString(
              path.join(stagingPath, HOOK_MANIFEST_FILENAME),
              JSON.stringify(manifest, null, 2) + "\n",
            )
            .pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "validation",
                  detail: "Hook manifest could not be written",
                  cause: e,
                }),
              ),
            );
          yield* fs
            .writeFileString(path.join(srcDir, entrypointFile), makeEntrypoint(runtime, fqn))
            .pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "validation",
                  detail: `Failed to write ${entrypointFile}`,
                  cause: e,
                }),
              ),
            );
        });
      },
    });

    return {
      result: "success",
      message: `Created hook ${fqn}`,
    } satisfies JobStepResult;
  });
