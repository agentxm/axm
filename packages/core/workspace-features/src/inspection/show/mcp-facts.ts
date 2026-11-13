import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { SettingsReader, WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";
import {
  mcpDistributionCandidates,
  mcpDistributionDestination,
  mcpDistributionId,
  manifestInputs,
  mcpInputVariables,
  mcpInputId,
  resolveMcpInvocation,
  mcpRunner,
  readMcpServerManifestAt,
} from "@agentxm/workspace-kernel/agent-adapters";
export const McpFactsSchema = Schema.Struct({
  sourceVersionLocked: Schema.Boolean,
  runtimeArtifactPinned: Schema.NullOr(Schema.Boolean),
  cwd: Schema.Literals(["host-default", "directory", "missing", "unverified", "not-applicable"]),
  runtime: Schema.Literal("not-checked"),
  distributions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.String,
      transport: Schema.String,
      destination: Schema.String,
      selected: Schema.Boolean,
      supported: Schema.Boolean,
      reason: Schema.optionalKey(Schema.String),
      inputs: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          required: Schema.Boolean,
          secret: Schema.Boolean,
          repeated: Schema.Boolean,
          hasDefault: Schema.Boolean,
        }),
      ),
    }),
  ),
});

export const inspectMcpPackageFacts = Effect.fn("Inspection.mcpPackageFacts")(function* (args: {
  readonly name: string;
  readonly paths: ReadonlyArray<string>;
  readonly accepted: boolean;
}) {
  const settings = yield* SettingsReader;
  const location = yield* WorkspaceLocation;
  const entry = (yield* settings.entries("mcp-server"))[args.name];
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  let cwd: (typeof McpFactsSchema.Type)["cwd"] =
    entry?.connection?.transport === "stdio" ? "host-default" : "not-applicable";
  if (entry?.connection?.transport === "stdio" && entry.connection.cwd !== undefined) {
    const selected = entry.connection.cwd;
    const directory =
      selected.base === "absolute" ? selected.path : path.resolve(location.baseDir, selected.path);
    const result = yield* Effect.result(fs.stat(directory));
    cwd =
      result._tag === "Success"
        ? result.success.type === "Directory"
          ? "directory"
          : "missing"
        : result.failure.reason._tag === "NotFound"
          ? "missing"
          : "unverified";
  }
  let distributions: (typeof McpFactsSchema.Type)["distributions"] = [];
  let runtimeArtifactPinned: boolean | null = null;
  if (entry?.kind !== "inline") {
    for (const root of args.paths) {
      const directory = path.resolve(location.baseDir, root);
      // Inventory also includes native config files, which cannot contain
      // an authored or acquired package manifest.
      const stat = yield* Effect.result(fs.stat(directory));
      if (Result.isFailure(stat) || stat.success.type !== "Directory") continue;
      const manifest = yield* readMcpServerManifestAt(directory);
      if (Option.isNone(manifest)) continue;
      const resolved = resolveMcpInvocation({
        manifest: manifest.value,
        distribution: entry?.distribution,
        bindings: entry?.bindings,
        auth: entry?.auth,
      });
      if (resolved._tag === "resolved") {
        runtimeArtifactPinned = resolved.runtimeArtifactPinned;
        cwd = resolved.connection.transport === "stdio" ? "host-default" : "not-applicable";
      }
      distributions = mcpDistributionCandidates(manifest.value).map((candidate) => {
        const runner = candidate.kind === "package" ? mcpRunner(candidate.package) : undefined;
        return {
          id: candidate.id,
          kind: candidate.kind,
          transport: candidate.selector.transport,
          destination: mcpDistributionDestination(candidate),
          selected:
            entry?.distribution !== undefined &&
            mcpDistributionId(entry.distribution) === candidate.id,
          supported: runner?._tag !== "unsupported",
          ...(runner?._tag === "unsupported" ? { reason: runner.reason } : {}),
          inputs: manifestInputs(candidate)
            .flatMap((input) => [
              input,
              ...Object.entries(mcpInputVariables(input.input) ?? {}).map(([variable, nested]) => ({
                ...input,
                target: { ...input.target, variable },
                input: nested,
              })),
            ])
            .map(({ target, input, repeated }) => ({
              id: mcpInputId(target),
              required: input.isRequired === true,
              secret: input.isSecret === true,
              repeated,
              hasDefault: input.default !== undefined,
            })),
        };
      });
      break;
    }
  }
  return {
    sourceVersionLocked: args.accepted,
    runtimeArtifactPinned,
    cwd,
    runtime: "not-checked",
    distributions,
  } satisfies typeof McpFactsSchema.Type;
});
