/**
 * Context files package materialization helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../app-error/index.js";
import { computeSourceHash } from "../extensions/rendered-files.js";
import { makeWorkspaceRelativePath, type RelativePath } from "../utils/path-types.js";
import { MaterializedFileTargetSchema, type MaterializedFileTarget } from "../lockfile/schema.js";
import {
  generateFileIndex,
  generateTableOfContents,
  isFileIndexColumn,
  type FileIndexColumn,
  type FileIndexOptions,
} from "./generators.js";
import type {
  FileContentSource,
  FileContentsEntry,
  FileInputValue,
  FileGeneratorSpec,
} from "./manifest-schema.js";
import { commentStyleForTarget, type FileRegionMarkerIdentity } from "./markers.js";

export interface FileTemplateContext {
  readonly inputs: Readonly<Record<string, FileInputValue>>;
  readonly vars: Readonly<Record<string, FileInputValue>>;
  readonly workspace: {
    readonly root: string;
  };
}

export interface RenderFileContentArgs {
  readonly packageRoot: string;
  readonly source: FileContentSource;
  readonly templateContext: FileTemplateContext;
  readonly generatedContext?:
    | {
        readonly target: string;
        readonly ownRegion?: FileRegionMarkerIdentity | undefined;
      }
    | undefined;
}

export interface MaterializeFileEntryArgs {
  readonly packageRoot: string;
  readonly workspaceRoot: string;
  readonly entry: FileContentsEntry;
  readonly templateContext: FileTemplateContext;
  readonly previousTarget?: MaterializedFileTarget | undefined;
}

export interface MaterializeFileEntryResult {
  readonly target: MaterializedFileTarget;
  readonly written: boolean;
  readonly reason: "created" | "updated" | "unchanged" | "preserved";
}

const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

const failValidation = (detail: string): Effect.Effect<never, AppError> =>
  Effect.fail(makeAppError({ code: "validation", detail }));

const isEscapingRelative = (path: Path.Path, root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === ".." || relative.startsWith("../") || path.isAbsolute(relative);
};

const resolvePayloadPath = (packageRoot: string, payloadPath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const srcRoot = path.resolve(packageRoot, "src");
    const resolved = path.resolve(srcRoot, payloadPath);
    if (isEscapingRelative(path, srcRoot, resolved)) {
      return yield* failValidation(
        `Context files package payload path escapes src/: ${payloadPath}`,
      );
    }
    return resolved;
  });

const resolveWorkspaceTarget = (workspaceRoot: string, target: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const relative = makeWorkspaceRelativePath(path, workspaceRoot, target);
    if (Option.isNone(relative)) {
      return yield* failValidation(`Context files package target escapes workspace: ${target}`);
    }
    return {
      relative: relative.value,
      absolute: path.resolve(workspaceRoot, relative.value),
    };
  });

const resolveWorkspacePath = (workspaceRoot: string, target: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const relative = makeWorkspaceRelativePath(path, workspaceRoot, target);
    if (Option.isNone(relative)) {
      return yield* failValidation(`File generator path escapes workspace: ${target}`);
    }
    return path.resolve(workspaceRoot, relative.value);
  });

const sourcePaths = (
  source: Extract<FileContentSource, { readonly kind: "static" | "template" }>,
) => (Array.isArray(source.path) ? source.path : [source.path]);

const readPayload = (packageRoot: string, payloadPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const resolved = yield* resolvePayloadPath(packageRoot, payloadPath);
    return yield* fs.readFileString(resolved).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read context files payload: ${payloadPath}`,
          cause: error,
        }),
      ),
    );
  });

const stringifyInputValue = (value: FileInputValue): string => String(value);

const generatorOption = (generator: FileGeneratorSpec, key: string): FileInputValue | undefined =>
  generator.options?.[key];

const optionalStringOption = (
  generator: FileGeneratorSpec,
  key: string,
): Effect.Effect<Option.Option<string>, AppError> => {
  const value = generatorOption(generator, key);
  if (value === undefined) return Effect.succeed(Option.none());
  return typeof value === "string"
    ? Effect.succeed(Option.some(value))
    : failValidation(`File generator option '${key}' must be a string`);
};

const optionalNumberOption = (
  generator: FileGeneratorSpec,
  key: string,
): Effect.Effect<Option.Option<number>, AppError> => {
  const value = generatorOption(generator, key);
  if (value === undefined) return Effect.succeed(Option.none());
  return typeof value === "number"
    ? Effect.succeed(Option.some(value))
    : failValidation(`File generator option '${key}' must be a number`);
};

const optionalBooleanOption = (
  generator: FileGeneratorSpec,
  key: string,
): Effect.Effect<Option.Option<boolean>, AppError> => {
  const value = generatorOption(generator, key);
  if (value === undefined) return Effect.succeed(Option.none());
  return typeof value === "boolean"
    ? Effect.succeed(Option.some(value))
    : failValidation(`File generator option '${key}' must be a boolean`);
};

const commaSeparatedPatterns = (value: Option.Option<string>): ReadonlyArray<string> =>
  Option.match(value, {
    onNone: () => [],
    onSome: (patterns) =>
      patterns
        .split(",")
        .map((pattern) => pattern.trim())
        .filter((pattern) => pattern !== ""),
  });

const fileIndexFormat = (
  value: Option.Option<string>,
): Effect.Effect<Option.Option<NonNullable<FileIndexOptions["format"]>>, AppError> =>
  Option.match(value, {
    onNone: () => Effect.succeed(Option.none()),
    onSome: (format) =>
      format === "list" || format === "tree" || format === "table"
        ? Effect.succeed(Option.some(format))
        : failValidation(`Unsupported file-index format: ${format}`),
  });

const fileIndexColumns = (
  value: Option.Option<string>,
): Effect.Effect<Option.Option<ReadonlyArray<FileIndexColumn>>, AppError> =>
  Option.match(value, {
    onNone: () => Effect.succeed(Option.none()),
    onSome: (columns) =>
      Effect.gen(function* () {
        const parts = columns
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part !== "");
        if (parts.length === 0) return Option.none<ReadonlyArray<FileIndexColumn>>();
        const parsed: Array<FileIndexColumn> = [];
        for (const part of parts) {
          if (!isFileIndexColumn(part)) {
            return yield* failValidation(`Unknown file-index column: ${part}`);
          }
          parsed.push(part);
        }
        return Option.some(parsed);
      }),
  });

const fileIndexOptions = (
  generator: FileGeneratorSpec,
): Effect.Effect<FileIndexOptions, AppError> =>
  Effect.gen(function* () {
    const format = yield* fileIndexFormat(yield* optionalStringOption(generator, "format"));
    const include = commaSeparatedPatterns(yield* optionalStringOption(generator, "include"));
    const exclude = commaSeparatedPatterns(yield* optionalStringOption(generator, "exclude"));
    const maxDepth = yield* optionalNumberOption(generator, "maxDepth");
    const includeHidden = yield* optionalBooleanOption(generator, "includeHidden");
    const respectGitignore = yield* optionalBooleanOption(generator, "respectGitignore");
    const columns = yield* fileIndexColumns(yield* optionalStringOption(generator, "columns"));
    return {
      ...(Option.isSome(format) && { format: format.value }),
      ...(include.length > 0 && { include }),
      ...(exclude.length > 0 && { exclude }),
      ...(Option.isSome(maxDepth) && { maxDepth: maxDepth.value }),
      ...(Option.isSome(includeHidden) && { includeHidden: includeHidden.value }),
      ...(Option.isSome(respectGitignore) && { respectGitignore: respectGitignore.value }),
      ...(Option.isSome(columns) && { columns: columns.value }),
    };
  });

const renderGeneratedContent = (
  generator: FileGeneratorSpec,
  context: FileTemplateContext,
  generatedContext?: RenderFileContentArgs["generatedContext"],
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    switch (generator.name) {
      case "file-index": {
        const options = yield* fileIndexOptions(generator);
        return yield* generateFileIndex(context.workspace.root, options);
      }
      case "toc": {
        const configuredSource = yield* optionalStringOption(generator, "source");
        const source = Option.match(configuredSource, {
          onNone: () => generatedContext?.target,
          onSome: (value) => value,
        });
        if (source === undefined) {
          return yield* failValidation("File generator option 'source' is required");
        }
        const target = yield* resolveWorkspacePath(context.workspace.root, source);
        const fs = yield* FileSystem.FileSystem;
        const content = yield* fs.readFileString(target).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to read table-of-contents source: ${source}`,
              cause: error,
            }),
          ),
        );
        const region = yield* optionalStringOption(generator, "region");
        const style = commentStyleForTarget(source);
        const generatedOwnRegion =
          generatedContext?.ownRegion !== undefined && Option.isSome(style)
            ? { marker: generatedContext.ownRegion, style: style.value }
            : undefined;
        const ownRegion =
          Option.isSome(region) && Option.isSome(style)
            ? { marker: { region: region.value, generator: "toc" }, style: style.value }
            : generatedOwnRegion;
        return generateTableOfContents(content, ownRegion);
      }
    }
  });

const resolveTemplateExpression = (
  expression: string,
  context: FileTemplateContext,
): Effect.Effect<string, AppError> => {
  const [namespace, key, extra] = expression.split(".");
  if (namespace === undefined || key === undefined || extra !== undefined) {
    return failValidation(`Unsupported file template expression: \${${expression}}`);
  }
  switch (namespace) {
    case "inputs": {
      const value = context.inputs[key];
      return value === undefined
        ? failValidation(`Missing file template input: ${key}`)
        : Effect.succeed(stringifyInputValue(value));
    }
    case "vars": {
      const value = context.vars[key];
      return value === undefined
        ? failValidation(`Missing file template variable: ${key}`)
        : Effect.succeed(stringifyInputValue(value));
    }
    case "workspace": {
      if (key !== "root") {
        return failValidation(`Unsupported workspace template value: ${key}`);
      }
      return Effect.succeed(context.workspace.root);
    }
    default:
      return failValidation(`Unsupported file template namespace: ${namespace}`);
  }
};

/**
 * Render scalar template placeholders in file payload content.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderFileTemplate = (
  content: string,
  context: FileTemplateContext,
): Effect.Effect<string, AppError> =>
  Effect.gen(function* () {
    const pattern = /\$\{([^}]+)\}/g;
    let output = "";
    let lastIndex = 0;
    let match = pattern.exec(content);
    while (match !== null) {
      const fullMatch = match[0];
      const expression = match[1];
      if (fullMatch === undefined || expression === undefined) {
        return yield* failValidation("Invalid file template expression");
      }
      output += content.slice(lastIndex, match.index);
      output += yield* resolveTemplateExpression(expression, context);
      lastIndex = match.index + fullMatch.length;
      match = pattern.exec(content);
    }
    return output + content.slice(lastIndex);
  });

/**
 * Render a file content source from package payloads.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderFileContent = ({
  packageRoot,
  source,
  templateContext,
  generatedContext,
}: RenderFileContentArgs): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    switch (source.kind) {
      case "static": {
        const chunks = yield* Effect.forEach(
          sourcePaths(source),
          (payloadPath) => readPayload(packageRoot, payloadPath),
          { concurrency: 1 },
        );
        return chunks.join("");
      }
      case "template": {
        const chunks = yield* Effect.forEach(
          sourcePaths(source),
          (payloadPath) =>
            readPayload(packageRoot, payloadPath).pipe(
              Effect.flatMap((content) => renderFileTemplate(content, templateContext)),
            ),
          { concurrency: 1 },
        );
        return chunks.join("");
      }
      case "generated":
        return yield* renderGeneratedContent(source.generator, templateContext, generatedContext);
    }
  });

const writeTarget = (
  absoluteTarget: string,
  content: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(absoluteTarget), { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create context files target directory: ${path.dirname(absoluteTarget)}`,
          cause: error,
        }),
      ),
    );
    yield* fs.writeFileString(absoluteTarget, content).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write context files target: ${absoluteTarget}`,
          cause: error,
        }),
      ),
    );
  });

const makeTargetRecord = (
  target: RelativePath,
  mode: FileContentsEntry["mode"],
  renderHash?: string | undefined,
): MaterializedFileTarget =>
  decodeMaterializedTarget({
    target,
    mode,
    ...(renderHash !== undefined && { renderHash }),
  });

/**
 * Materialize one whole-file entry.
 *
 * `managed-region` entries are rejected here and handled by the marker phase.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const materializeFileEntry = ({
  packageRoot,
  workspaceRoot,
  entry,
  templateContext,
  previousTarget,
}: MaterializeFileEntryArgs): Effect.Effect<
  MaterializeFileEntryResult,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (entry.mode === "managed-region") {
      return yield* failValidation("managed-region materialization requires marker support");
    }

    const fs = yield* FileSystem.FileSystem;
    const targetPath = yield* resolveWorkspaceTarget(workspaceRoot, entry.target);
    const content = yield* renderFileContent({
      packageRoot,
      source: entry.source,
      templateContext,
      generatedContext: { target: entry.target },
    });
    const renderHash = computeSourceHash(content);
    const target = makeTargetRecord(targetPath.relative, entry.mode, renderHash);
    const exists = yield* fs
      .exists(targetPath.absolute)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (entry.mode === "sync-once" && exists) {
      return {
        target: makeTargetRecord(targetPath.relative, entry.mode),
        written: false,
        reason: "preserved",
      };
    }

    if (
      entry.mode === "sync-always" &&
      exists &&
      previousTarget?.renderHash !== undefined &&
      previousTarget.renderHash === renderHash
    ) {
      return { target, written: false, reason: "unchanged" };
    }

    yield* writeTarget(targetPath.absolute, content);
    return {
      target,
      written: true,
      reason: exists ? "updated" : "created",
    };
  });
