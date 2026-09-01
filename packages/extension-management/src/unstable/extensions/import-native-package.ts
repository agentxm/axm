import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import {
  manifestFilenameForType,
  manifestSchemaForType,
} from "@agentxm/registry-protocol/unstable/publish/manifest-policy";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions/common";
import {
  parseFrontmatterEffect,
  type FrontmatterParseFailure,
} from "@agentxm/registry-protocol/unstable/content/frontmatter";
import { copyExtensionDirectory } from "./utils.js";
import {
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
} from "@agentxm/extension-workspace";

const NATIVE_IMPORT_VERSION = "0.1.0";
const MANIFEST_FILENAMES = new Set([
  "skill.json",
  "mcp.json",
  "subagent.json",
  "rule.json",
  "hook.json",
  "knowledge.json",
  "pack.json",
]);

export interface ImportNativeExtensionPackageArgs {
  readonly sourcePath: string;
  readonly targetDir: string;
  readonly target: ExtensionFqnParts;
}

export type NativeImportError =
  | NativeImportConflict
  | NativeImportFailed
  | NativeImportInvalid
  | NativeImportUnsupported
  | FrontmatterParseFailure;

const mapWriteError =
  (detail: string) =>
  (cause: unknown): NativeImportFailed =>
    new NativeImportFailed({ detail, cause });

const rewriteFrontmatterName = (
  filePath: string,
  name: string,
): Effect.Effect<
  void,
  NativeImportFailed | NativeImportInvalid | FrontmatterParseFailure,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs
      .readFileString(filePath)
      .pipe(Effect.mapError(mapWriteError(`Native content could not be read: ${filePath}`)));
    const parsed = yield* parseFrontmatterEffect(content);
    if (typeof parsed.frontmatter !== "object" || parsed.frontmatter === null) {
      return yield* new NativeImportInvalid({
        detail: `Native content must contain YAML frontmatter: ${filePath}`,
      });
    }
    const frontmatter = { ...parsed.frontmatter, name };
    const yaml = YAML.stringify(frontmatter, { lineWidth: 0 }).trim();
    const body = parsed.body.startsWith("\n") ? parsed.body : `\n${parsed.body}`;
    yield* fs
      .writeFileString(filePath, `---\n${yaml}\n---${body}`)
      .pipe(Effect.mapError(mapWriteError(`Native content could not be normalized: ${filePath}`)));
  });

const selectMarkdownFile = (
  sourcePath: string,
  preferredName: string,
): Effect.Effect<
  string,
  NativeImportFailed | NativeImportInvalid,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const inspectionFailed = mapWriteError(`Native source could not be inspected: ${sourcePath}`);
    const stat = yield* fs.stat(sourcePath).pipe(Effect.mapError(inspectionFailed));
    if (stat.type === "File") return sourcePath;
    if (stat.type !== "Directory") {
      return yield* new NativeImportInvalid({
        detail: `Native source must be a Markdown file or directory: ${sourcePath}`,
      });
    }
    const entries = yield* fs.readDirectory(sourcePath).pipe(Effect.mapError(inspectionFailed));
    const preferred = [`${preferredName}.md`, preferredName, "SKILL.md", "RULE.md"]
      .map((name) => entries.find((entry) => entry === name))
      .find((entry) => entry !== undefined);
    if (preferred !== undefined) return path.join(sourcePath, preferred);
    const markdown = entries.filter(
      (entry) => entry.toLowerCase().endsWith(".md") && entry.toLowerCase() !== "readme.md",
    );
    if (markdown.length !== 1 || markdown[0] === undefined) {
      return yield* new NativeImportInvalid({
        detail: `Native source must contain exactly one unambiguous Markdown document: ${sourcePath}`,
      });
    }
    return path.join(sourcePath, markdown[0]);
  });

const rejectManagedPackage = (
  sourcePath: string,
): Effect.Effect<
  void,
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
    const manifest = entries.find((entry) => MANIFEST_FILENAMES.has(entry));
    if (manifest !== undefined) {
      return yield* new NativeImportInvalid({
        detail: `Source is already a managed AXM package (${manifest}); use fork instead of import`,
      });
    }
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
    yield* rejectManagedPackage(args.sourcePath);
    if (yield* fs.exists(args.targetDir).pipe(Effect.mapError(importFailed))) {
      return yield* new NativeImportConflict({ targetDir: args.targetDir });
    }
    yield* fs
      .makeDirectory(args.targetDir, { recursive: true })
      .pipe(
        Effect.mapError(mapWriteError(`Import target could not be created: ${args.targetDir}`)),
      );

    switch (args.target.type) {
      case "skill": {
        const stat = yield* fs.stat(args.sourcePath).pipe(Effect.mapError(importFailed));
        if (stat.type === "Directory") {
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
        yield* rewriteFrontmatterName(
          path.join(args.targetDir, "src", "SKILL.md"),
          args.target.name,
        );
        break;
      }
      case "subagent": {
        yield* fs
          .makeDirectory(path.join(args.targetDir, "src"), { recursive: true })
          .pipe(Effect.mapError(importFailed));
        const sourceFile = yield* selectMarkdownFile(args.sourcePath, args.target.name);
        const targetFile = path.join(args.targetDir, "src", `${args.target.name}.md`);
        yield* fs
          .copyFile(sourceFile, targetFile)
          .pipe(Effect.mapError(mapWriteError("Native subagent document could not be copied")));
        yield* rewriteFrontmatterName(targetFile, args.target.name);
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
