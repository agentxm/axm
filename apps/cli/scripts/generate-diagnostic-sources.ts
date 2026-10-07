import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { format, resolveConfig } from "prettier";

class DiagnosticCatalogFailed extends Data.TaggedError("DiagnosticCatalogFailed")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

// These are the CLI's owned runtime packages, including its bundled implementation dependencies.
const packages = [
  ["axm.sh", "apps/cli", "./runtime"],
  ["@agentxm/registry-client", "packages/supporting/registry-client", "."],
  ["@agentxm/registry-access", "packages/supporting/registry-access", "./authentication"],
  ["@agentxm/registry-protocol", "packages/core/registry-protocol", "./unstable/publish"],
  ["@agentxm/workspace-kernel", "packages/core/workspace-kernel", "./operations"],
  ["@agentxm/workspace-features", "packages/core/workspace-features", "./publishing"],
  ["@agentxm/extension-content", "packages/core/extension-content", "."],
  ["@agentxm/extension-kinds", "packages/core/extension-kinds", "./live"],
  ["@agentxm/extension-model", "packages/core/extension-model", "./unstable/date-time"],
  ["@agentxm/host-primitives", "packages/generic/host-primitives", "."],
  ["@agentxm/cli-maintenance", "packages/supporting/cli-maintenance", "./official-skill/domain"],
] as const;

const manifestSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  exports: Schema.Record(Schema.String, Schema.Unknown),
});
const entrySchema = Schema.Struct({
  "axm-source": Schema.NonEmptyString,
  default: Schema.NonEmptyString,
});

const generate = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dirname, "../../..");
  const output = path.join(root, "apps/cli/src/__generated__/diagnostic-sources.ts");
  const catalog = [];
  for (const [module, directory, exported] of packages) {
    const packageRoot = path.join(root, directory);
    const manifest = yield* fs
      .readFileString(path.join(packageRoot, "package.json"))
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(manifestSchema))));
    if (manifest.name !== module)
      return yield* new DiagnosticCatalogFailed({ detail: `Unexpected package in ${directory}` });
    const entry = yield* Schema.decodeUnknownEffect(entrySchema)(manifest.exports[exported]);
    const sources: Record<string, number> = {};
    const visit = (relative: string): Effect.Effect<void, DiagnosticCatalogFailed> =>
      Effect.gen(function* () {
        for (const name of (yield* fs.readDirectory(path.join(packageRoot, relative))).sort()) {
          const filename = `${relative}/${name}`;
          const info = yield* fs.stat(path.join(packageRoot, filename));
          if (info.type === "Directory") {
            if (name !== "test-support" && name !== "testing") yield* visit(filename);
          } else if (
            info.type === "File" &&
            /^src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.(?:ts|tsx|js|jsx)$/u.test(
              filename,
            ) &&
            !/\.(?:test|spec|e2e\.test|d)\.tsx?$/u.test(name) &&
            name !== "testing.ts" &&
            filename !== "src/__generated__/diagnostic-sources.ts"
          ) {
            sources[filename] = (yield* fs.readFileString(path.join(packageRoot, filename))).split(
              "\n",
            ).length;
          }
        }
      }).pipe(
        Effect.mapError(
          (cause) =>
            new DiagnosticCatalogFailed({ detail: "Could not enumerate owned sources", cause }),
        ),
      );
    yield* visit("src");
    const sourceEntry = entry["axm-source"].replace(/^\.\//u, "");
    if (sources[sourceEntry] === undefined)
      return yield* new DiagnosticCatalogFailed({
        detail: `Uncatalogued source entry for ${module}`,
      });
    catalog.push({
      module,
      directory,
      entry: exported === "." ? module : `${module}${exported.slice(1)}`,
      sourceEntry,
      builtEntry: entry.default.replace(/^\.\//u, ""),
      sources,
    });
  }
  const header = `/**
 * @generated build artifact by cli:build:diagnostic-sources.
 * Regenerate: pnpm exec nx run cli:build:diagnostic-sources
 * Only owned production source names and line bounds; no source contents or host paths.
 */\n`;
  const source = `${header}export const DIAGNOSTIC_SOURCES = ${JSON.stringify(catalog)} as const;\n`;
  const formatted = yield* Effect.tryPromise({
    try: async () => format(source, { ...(await resolveConfig(output)), filepath: output }),
    catch: (cause) =>
      new DiagnosticCatalogFailed({ detail: "Could not format source catalog", cause }),
  });
  yield* fs.makeDirectory(path.dirname(output), { recursive: true });
  yield* fs.writeFileString(output, formatted);
  yield* Console.log(`Generated diagnostic source catalog for ${catalog.length} owned packages`);
});

NodeRuntime.runMain(generate.pipe(Effect.provide(NodeServices.layer)));
