import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { manifestSchemaForType } from "@agentxm/extension-content";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions/common";
import type { AgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { importNativeSubagent, type NativeSourceInspection } from "./import-native-subagent.js";
import {
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
  NativeSubagentRuntimeRequired,
  NativeSubagentImportUnsupported,
} from "./authored-package-errors.js";
import { copyExtensionDirectory } from "@agentxm/workspace-kernel/acquisition";
import {
  extensionTypeForManifestFilename,
  manifestFilenameForType,
} from "@agentxm/extension-model/unstable/extensions/common";
const NATIVE_IMPORT_VERSION = "0.1.0";
export interface ImportNativeExtensionPackageArgs {
  readonly sourcePath: string;
  readonly targetDir: string;
  readonly target: ExtensionFqnParts;
  readonly sourceAgent?: AgentId;
  readonly existingPackagePath?: string;
}

export type NativeImportError =
  | NativeImportConflict
  | NativeImportFailed
  | NativeImportInvalid
  | NativeImportUnsupported
  | NativeSubagentRuntimeRequired
  | NativeSubagentImportUnsupported;

const mapWriteError =
  (detail: string) =>
  (cause: unknown): NativeImportFailed =>
    new NativeImportFailed({ detail, cause });

/**
 * Refuse a source that is already a managed package, returning what the check
 * observed about the source so the rest of the same import need not inspect
 * it again. A file source's parent listing stays private to this check.
 */
const rejectManagedPackage = (
  sourcePath: string,
): Effect.Effect<
  NativeSourceInspection,
  NativeImportFailed | NativeImportInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const inspectionFailed = mapWriteError(`Native source could not be inspected: ${sourcePath}`);
    const stat = yield* fs.stat(sourcePath).pipe(Effect.mapError(inspectionFailed));
    const directory = stat.type === "Directory" ? sourcePath : path.dirname(sourcePath);
    const entries = yield* fs.readDirectory(directory).pipe(Effect.mapError(inspectionFailed));
    const manifest = entries.find((entry) => extensionTypeForManifestFilename(entry) !== undefined);
    if (manifest !== undefined) {
      return yield* new NativeImportInvalid({
        detail: `Source is already a managed AXM package (${manifest}); use fork instead of import`,
      });
    }
    const inspection: NativeSourceInspection =
      stat.type === "Directory"
        ? { kind: "directory", entries: Object.freeze([...entries]) }
        : stat.type === "File"
          ? { kind: "file" }
          : { kind: "other" };
    return Object.freeze(inspection);
  });

export const importNativeExtensionPackage = (
  args: ImportNativeExtensionPackageArgs,
): Effect.Effect<void, NativeImportError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const importFailed = mapWriteError(`Native import failed for ${args.sourcePath}`);
    if (args.target.type !== "skill" && args.target.type !== "subagent") {
      return yield* new NativeImportUnsupported({ type: args.target.type });
    }
    // The inspection belongs to this call: the source is not written before
    // the definition-file or copy choice reads it.
    const source = yield* rejectManagedPackage(args.sourcePath);
    if (yield* fs.exists(args.targetDir).pipe(Effect.mapError(importFailed))) {
      return yield* new NativeImportConflict({ targetDir: args.targetDir });
    }
    if (args.target.type === "subagent") {
      return yield* importNativeSubagent(args, source);
    }
    yield* fs
      .makeDirectory(args.targetDir, { recursive: true })
      .pipe(
        Effect.mapError(mapWriteError(`Import target could not be created: ${args.targetDir}`)),
      );

    switch (args.target.type) {
      case "skill": {
        if (source.kind === "directory") {
          yield* copyExtensionDirectory(args.sourcePath, path.join(args.targetDir, "src")).pipe(
            Effect.mapError(mapWriteError("Native skill content could not be copied")),
          );
        } else {
          yield* fs
            .makeDirectory(path.join(args.targetDir, "src"), { recursive: true })
            .pipe(Effect.mapError(importFailed));
          yield* fs
            .copyFile(args.sourcePath, path.join(args.targetDir, "src", "SKILL.md"))
            .pipe(Effect.mapError(mapWriteError("Native skill document could not be copied")));
        }
        break;
      }
    }

    const manifest = {
      $schema: `https://axm.sh/schemas/${manifestFilenameForType(args.target.type).replace(".json", ".schema.json")}`,
      owner: args.target.owner,
      type: args.target.type,
      name: args.target.name,
      version: NATIVE_IMPORT_VERSION,
    };
    yield* Schema.decodeUnknownEffect(manifestSchemaForType(args.target.type))(manifest).pipe(
      Effect.mapError(
        (cause) =>
          new NativeImportInvalid({ detail: "Imported package manifest is invalid", cause }),
      ),
    );
    yield* fs
      .writeFileString(
        path.join(args.targetDir, manifestFilenameForType(args.target.type)),
        `${JSON.stringify(manifest, null, 2)}\n`,
      )
      .pipe(Effect.mapError(mapWriteError("Imported package manifest could not be written")));
  });
