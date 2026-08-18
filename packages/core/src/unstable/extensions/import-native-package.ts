// @effect-diagnostics anyUnknownInErrorContext:off — native package inspection translates opaque platform errors to AppError here
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import { AppError, makeAppError } from "../app-error/index.js";
import { inspectKnowledgeBundle } from "../knowledge/okf.js";
import { manifestFilenameForType, manifestSchemaForType } from "../publish/manifest-policy.js";
import type { ExtensionFqnParts } from "./common.js";
import { frontmatterParseFailureToAppError, parseFrontmatterEffect } from "./frontmatter.js";
import { copyExtensionDirectory } from "./utils.js";

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

const mapWriteError =
  (detail: string) =>
  (cause: unknown): AppError =>
    makeAppError({ code: "internal", detail, cause });

const preserveAppError =
  (detail: string) =>
  (cause: unknown): AppError =>
    cause instanceof AppError ? cause : mapWriteError(detail)(cause);

const rewriteFrontmatterName = (
  filePath: string,
  name: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs
      .readFileString(filePath)
      .pipe(Effect.mapError(mapWriteError(`Native content could not be read: ${filePath}`)));
    const parsed = yield* parseFrontmatterEffect(content).pipe(
      Effect.mapError(frontmatterParseFailureToAppError),
    );
    if (typeof parsed.frontmatter !== "object" || parsed.frontmatter === null) {
      return yield* makeAppError({
        code: "validation",
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
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stat = yield* fs
      .stat(sourcePath)
      .pipe(Effect.mapError(mapWriteError(`Native source could not be inspected: ${sourcePath}`)));
    if (stat.type === "File") return sourcePath;
    if (stat.type !== "Directory") {
      return yield* makeAppError({
        code: "validation",
        detail: `Native source must be a Markdown file or directory: ${sourcePath}`,
      });
    }
    const entries = yield* fs.readDirectory(sourcePath);
    const preferred = [`${preferredName}.md`, preferredName, "SKILL.md", "RULE.md"]
      .map((name) => entries.find((entry) => entry === name))
      .find((entry) => entry !== undefined);
    if (preferred !== undefined) return path.join(sourcePath, preferred);
    const markdown = entries.filter(
      (entry) => entry.toLowerCase().endsWith(".md") && entry.toLowerCase() !== "readme.md",
    );
    if (markdown.length !== 1 || markdown[0] === undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Native source must contain exactly one unambiguous Markdown document: ${sourcePath}`,
      });
    }
    return path.join(sourcePath, markdown[0]);
  }).pipe(Effect.mapError(preserveAppError(`Native source could not be inspected: ${sourcePath}`)));

const rejectManagedPackage = (
  sourcePath: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stat = yield* fs.stat(sourcePath);
    const directory = stat.type === "Directory" ? sourcePath : path.dirname(sourcePath);
    const entries = yield* fs.readDirectory(directory);
    const manifest = entries.find((entry) => MANIFEST_FILENAMES.has(entry));
    if (manifest !== undefined) {
      return yield* makeAppError({
        code: "validation",
        detail: `Source is already a managed AXM package (${manifest}); use fork instead of import`,
      });
    }
  }).pipe(Effect.mapError(preserveAppError(`Native source could not be inspected: ${sourcePath}`)));

export const importNativeExtensionPackage = (
  args: ImportNativeExtensionPackageArgs,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (args.target.type === "mcp-server") {
      return yield* makeAppError({
        code: "usage",
        detail: "Import MCP configuration with axm mcps import",
      });
    }
    if (args.target.type === "hook" || args.target.type === "pack") {
      return yield* makeAppError({
        code: "usage",
        detail: `Native ${args.target.type} import has no lossless supported representation`,
      });
    }
    yield* rejectManagedPackage(args.sourcePath);
    if (yield* fs.exists(args.targetDir)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Import target already exists: ${args.targetDir}`,
      });
    }
    yield* fs
      .makeDirectory(args.targetDir, { recursive: true })
      .pipe(
        Effect.mapError(mapWriteError(`Import target could not be created: ${args.targetDir}`)),
      );

    switch (args.target.type) {
      case "skill": {
        const stat = yield* fs.stat(args.sourcePath);
        if (stat.type === "Directory") {
          yield* copyExtensionDirectory(args.sourcePath, path.join(args.targetDir, "src")).pipe(
            Effect.mapError(mapWriteError("Native skill content could not be copied")),
          );
        } else {
          yield* fs.makeDirectory(path.join(args.targetDir, "src"), { recursive: true });
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
        yield* fs.makeDirectory(path.join(args.targetDir, "src"), { recursive: true });
        const sourceFile = yield* selectMarkdownFile(args.sourcePath, args.target.name);
        const targetFile = path.join(args.targetDir, "src", `${args.target.name}.md`);
        yield* fs
          .copyFile(sourceFile, targetFile)
          .pipe(Effect.mapError(mapWriteError("Native subagent document could not be copied")));
        yield* rewriteFrontmatterName(targetFile, args.target.name);
        break;
      }
      case "rule": {
        yield* fs.makeDirectory(path.join(args.targetDir, "src"), { recursive: true });
        const sourceFile = yield* selectMarkdownFile(args.sourcePath, args.target.name);
        yield* fs
          .copyFile(sourceFile, path.join(args.targetDir, "src", "RULE.md"))
          .pipe(Effect.mapError(mapWriteError("Native rule document could not be copied")));
        break;
      }
      case "knowledge": {
        const stat = yield* fs.stat(args.sourcePath);
        if (stat.type !== "Directory") {
          return yield* makeAppError({
            code: "usage",
            detail: "Knowledge import requires an Open Knowledge Format 0.2 bundle directory",
          });
        }
        const inspection = yield* inspectKnowledgeBundle(args.sourcePath).pipe(
          Effect.mapError(mapWriteError("Knowledge bundle could not be inspected")),
        );
        const errors = inspection.diagnostics.filter(
          (diagnostic) => diagnostic.severity === "error",
        );
        if (errors.length > 0) {
          const firstError = errors[0];
          const firstErrorMessage =
            firstError === undefined
              ? "invalid OKF bundle"
              : firstError.details?.kind === "frontmatter-parse"
                ? `${firstError.relativePath}: ${firstError.message}`
                : firstError.message;
          return yield* makeAppError({
            code: "validation",
            detail: `Knowledge bundle is not losslessly importable: ${firstErrorMessage}`,
          });
        }
        yield* copyExtensionDirectory(args.sourcePath, path.join(args.targetDir, "src")).pipe(
          Effect.mapError(mapWriteError("Knowledge bundle could not be copied")),
        );
        break;
      }
    }

    const manifest = {
      $schema: `https://axm.sh/schemas/${manifestFilenameForType(args.target.type).replace(".json", ".schema.json")}`,
      owner: args.target.owner,
      type: args.target.type,
      name: args.target.name,
      version: NATIVE_IMPORT_VERSION,
      ...(args.target.type === "knowledge"
        ? { format: { name: "okf", version: "0.2" }, bundleRoot: "src" }
        : {}),
    };
    yield* Schema.decodeUnknownEffect(manifestSchemaForType(args.target.type))(manifest).pipe(
      Effect.mapError((cause) =>
        makeAppError({ code: "validation", detail: "Imported package manifest is invalid", cause }),
      ),
    );
    yield* fs
      .writeFileString(
        path.join(args.targetDir, manifestFilenameForType(args.target.type)),
        `${JSON.stringify(manifest, null, 2)}\n`,
      )
      .pipe(Effect.mapError(mapWriteError("Imported package manifest could not be written")));
  }).pipe(Effect.mapError(preserveAppError(`Native import failed for ${args.sourcePath}`)));
