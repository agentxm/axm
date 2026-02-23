/**
 * Packs new handler — scaffolds a new empty pack with `axm-pack.json`.
 *
 * Creates the pack directory and manifest, then registers the pack in settings.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { PackManifest } from "../../../extensions/packs/manifest-schema.js";
import { formatFqn } from "../../../extensions/index.js";
import { computePackPaths } from "../../../extensions/packs/paths.js";
import { PACK_MANIFEST_FILENAME } from "../../../extensions/packs/manifest-schema.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksNewHandlerArgs {
  /** Name of the pack (without namespace). */
  readonly name: string;
  /** Optional namespace override. */
  readonly namespace: Option.Option<string>;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handlePacksNew = Effect.fn("PacksNew.handle")(function* (args: PacksNewHandlerArgs) {
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* Log;

  yield* log.info("axm packs new");

  // Resolve namespace
  const normalizeNamespace = (s: string) => (s.startsWith("@") ? s : `@${s}`);
  const namespace = Option.isSome(args.namespace)
    ? normalizeNamespace(args.namespace.value)
    : yield* ws.getConfiguredNamespace().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeCliError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No namespace configured for pack creation",
                  howToFix:
                    "Configure a namespace in settings.json with `axm init`, or use --namespace",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  const fqn = formatFqn({ namespace, type: "packs", name: args.name });
  const base = ws.baseDir;

  // Compute pack directory path
  const packDir = computePackPaths(path.join, base, namespace, args.name);
  const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

  // Check if pack already exists
  const exists = yield* fs.exists(manifestPath).pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "PACK_CHECK_FAILED",
        what: `Failed to check if pack exists: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  if (exists) {
    return yield* makeCliError({
      code: "PACK_ALREADY_EXISTS",
      what: `Pack '${fqn}' already exists at ${packDir.canonicalPath}`,
      howToFix: "Choose a different name or remove the existing pack first",
    });
  }

  // Create pack directory
  yield* fs.makeDirectory(packDir.canonicalPath, { recursive: true }).pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "PACK_CREATE_FAILED",
        what: `Failed to create pack directory: ${packDir.canonicalPath}`,
        cause: e,
      }),
    ),
  );

  // Write manifest
  const manifest: PackManifest = {
    name: fqn,
    version: "0.0.1",
    skills: {},
    commands: {},
    "mcp-servers": {},
  };

  yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "PACK_CREATE_FAILED",
        what: `Failed to write pack manifest: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  // Register in settings
  const now = new Date();
  yield* ws.setPack({
    namespace,
    name: args.name,
    resolvedVersion: "0.0.1",
    integrity: "",
    sourceName: "",
    installedAt: now,
    updatedAt: now,
    resolvedSkills: {},
    resolvedCommands: {},
    resolvedMcpServers: {},
    versionConstraint: Option.none(),
  });

  yield* log.success(`Created pack ${fqn}`);
});
