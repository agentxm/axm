import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { ExitCode, makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { effectCliExit, withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  inspectKnowledgeBundle,
  type KnowledgeDiagnostic,
} from "@agentxm/client-core/unstable/knowledge";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { inspectInstalledKnowledge } from "./inspect.js";

const DiagnosticSchema = Schema.Struct({
  bundle: Schema.String,
  code: Schema.String,
  severity: Schema.String,
  relativePath: Schema.String,
  message: Schema.String,
});

export const KnowledgeLintQueryResultSchema = Schema.Struct({
  valid: Schema.Boolean,
  diagnostics: Schema.Array(DiagnosticSchema),
});
export type KnowledgeLintQueryResult = typeof KnowledgeLintQueryResultSchema.Type;

const flattenDiagnostics = (
  bundles: ReadonlyArray<{
    readonly name: string;
    readonly inspection: { readonly diagnostics: ReadonlyArray<KnowledgeDiagnostic> };
  }>,
) =>
  bundles.flatMap(({ name, inspection }) =>
    inspection.diagnostics.map((item) => ({ bundle: name, ...item })),
  );

const inspectAuthoredKnowledge = Effect.fn("Knowledge.inspectAuthored")(function* (
  packagePath: string,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packageRoot = path.resolve(ws.baseDir, packagePath);
  const manifestRaw = yield* fs
    .readFileString(path.join(packageRoot, KNOWLEDGE_MANIFEST_FILENAME))
    .pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Failed to read ${KNOWLEDGE_MANIFEST_FILENAME} from ${packagePath}`,
          cause,
        }),
      ),
    );
  const manifest = yield* Effect.try({
    try: (): unknown => JSON.parse(manifestRaw),
    catch: (cause) =>
      makeAppError({
        code: "validation",
        detail: `Failed to parse ${KNOWLEDGE_MANIFEST_FILENAME} from ${packagePath}`,
        cause,
      }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(KnowledgeManifestSchema)),
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Invalid ${KNOWLEDGE_MANIFEST_FILENAME} in ${packagePath}`,
        cause,
      }),
    ),
  );
  const sourceRoot = path.join(packageRoot, KNOWLEDGE_SOURCE_DIR);
  const inspection = yield* inspectKnowledgeBundle(sourceRoot).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Failed to inspect authored Knowledge package ${packagePath}`,
        cause,
      }),
    ),
  );
  return [{ name: manifest.name, sourceRoot, inspection }];
});

export const handleKnowledgeLint = Effect.fn("Knowledge.lint")(function* (
  name?: string,
  packagePath?: string,
) {
  const renderer = yield* CliRenderer;
  if (name !== undefined && packagePath !== undefined) {
    return yield* makeAppError({
      code: "validation",
      detail: "Choose either an installed bundle name or --path, not both",
    });
  }
  const bundles =
    packagePath === undefined
      ? yield* inspectInstalledKnowledge(name)
      : yield* inspectAuthoredKnowledge(packagePath);
  const diagnostics = flattenDiagnostics(bundles);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const result = { valid: errors.length === 0, diagnostics };
  if (!(yield* renderer.result(result, KnowledgeLintQueryResultSchema, { ok: result.valid }))) {
    if (diagnostics.length === 0) {
      yield* renderer.success(
        `Knowledge validation passed for ${bundles.length} bundle${bundles.length === 1 ? "" : "s"}`,
      );
    } else {
      for (const diagnostic of diagnostics) {
        const message = `${diagnostic.bundle}/${diagnostic.relativePath}: ${diagnostic.message}`;
        if (diagnostic.severity === "error") yield* renderer.error(message);
        else yield* renderer.warn(message);
      }
      if (errors.length > 0) {
        yield* renderer.error(
          `${errors.length} knowledge validation error${errors.length === 1 ? "" : "s"}`,
        );
      }
    }
  }
  // Exit non-zero without a second stdout document: the findings above are the
  // command's only output, so signal failure with an exit code rather than an
  // AppError envelope (mirrors `axm lint`).
  if (errors.length > 0) {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});

const lintConfig = {
  bundle: Argument.string("bundle").pipe(
    Argument.withDescription("Optional installed bundle name"),
    Argument.optional,
  ),
  path: Flag.string("path").pipe(
    Flag.withDescription("Validate a locally authored Knowledge package directory"),
    Flag.optional,
  ),
  ...scopeConfig,
} as const;

export const lintCommand = Command.make("lint", lintConfig, ({ bundle, path, scope }) =>
  handleKnowledgeLint(Option.getOrUndefined(bundle), Option.getOrUndefined(path)).pipe(
    withWorkspace(scope),
    withRuntime("knowledge lint"),
  ),
).pipe(
  withArgvTracking(lintConfig),
  Command.withDescription("Validate installed or locally authored Open Knowledge Format bundles"),
  Command.withExamples([
    { command: "axm knowledge lint", description: "Validate all installed knowledge bundles" },
    {
      command: "axm knowledge lint platform",
      description: "Validate one installed knowledge bundle",
    },
    {
      command: "axm knowledge lint --path ./knowledge/platform",
      description: "Validate a locally authored Knowledge package",
    },
  ]),
);
