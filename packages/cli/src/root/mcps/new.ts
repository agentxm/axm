import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  decodeExtensionNameSync,
  formatFqn,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CONFIGURABLE_AGENTS_BY_ID } from "@agentxm/client-core/unstable/agent-capabilities";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  DEFAULT_WORKSPACE_SCOPE,
  resolveWorkspaceExtensionRef,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import {
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlanResolution,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  installMcpServer,
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  type McpServerManifest,
} from "@agentxm/client-core/unstable/mcps";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { isValidScaffoldName, normalizeScaffoldOwner } from "../shared/scaffold-name.js";
import { emitScaffoldSuccess } from "../shared/scaffold-success.js";

const mcpNewArtifactOutput = (
  resolution: PlanResolution,
): { readonly targetPhrase: string; readonly summary: string } | undefined => {
  if (resolution._tag !== "ExecutedPlan") return undefined;

  for (const job of resolution.jobs) {
    for (const step of job.steps) {
      if (step.result.result !== "success" || step.result.artifact === undefined) continue;

      const artifact = step.result.artifact;
      const targets = artifact.targets ?? [];
      const agentIds = new Set(targets.flatMap((target) => target.agentIds ?? []));
      const targetPhrase =
        agentIds.size > 0
          ? ` for ${count(agentIds.size, "agent")}`
          : targets.length > 0
            ? ` with ${count(targets.length, "target")}`
            : "";

      return {
        targetPhrase,
        summary: mcpNewArtifactSummary(artifact),
      };
    }
  }

  return undefined;
};

const mcpNewArtifactSummary = (artifact: JobStepArtifact): string => {
  const targets = artifact.targets ?? [];
  return targets.length === 0 ? `-> ${artifact.path}` : `-> ${count(targets.length, "target")}`;
};

export const handleMcpServersNew = Effect.fn("McpServersNew.handle")(function* (args: {
  readonly name: ExtensionName;
  readonly description: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const agentRepo = yield* CodingAgentRepository;
  const owner = Option.isSome(args.owner)
    ? normalizeScaffoldOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("MCP server creation");
  const version = decodeVersionSync("0.1.0");
  const fqn = formatFqn({ owner, type: "mcp-server", name: args.name });

  if (!isValidScaffoldName(args.name)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid MCP server name: "${args.name}"`,
    });
  }

  const targetDir = path.join(ws.baseDir, REGISTRY_EXTENSIONS_DIR, owner, "mcps", args.name);
  const manifestPath = path.join(targetDir, MCP_SERVER_MANIFEST_FILENAME);
  const sourcePath = joinDisplayPath(path, ".axm", "extensions", owner, "mcps", args.name);
  const exists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));
  if (exists && !args.force) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Managed MCP server directory already exists: ${targetDir}`,
      suggestions: [
        {
          description: "Choose a different name or remove the existing directory first",
        },
      ],
    });
  }

  const manifest: McpServerManifest = {
    $schema: MCP_SERVER_MANIFEST_SCHEMA_URL,
    owner,
    type: "mcp-server",
    name: args.name,
    version,
    description: args.description || `MCP server ${args.name}`,
    license: "MIT",
    server: {
      $schema: MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
      name: `io.github.example/${args.name}`,
      description: args.description || `MCP server ${args.name}`,
      version,
      packages: [
        {
          registryType: "npm",
          identifier: args.name,
          version,
          transport: { type: "stdio" },
        },
      ],
    },
  };
  const step: PlannedJobStep = {
    readiness: "ready",
    label: fqn,
    run: Effect.gen(function* () {
      yield* fs.makeDirectory(targetDir, { recursive: true }).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to create MCP server directory: ${targetDir}`,
            cause: error,
          }),
        ),
      );
      yield* fs.writeFileString(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write MCP server manifest: ${manifestPath}`,
            cause: error,
          }),
        ),
      );
      yield* ws.setMcpServerEntry(args.name, {
        source: `workspace:${fqn}`,
        enabled: true,
        env: {},
      });
      const resolvedRef = yield* resolveWorkspaceExtensionRef({
        settingsName: args.name,
        source: `workspace:${fqn}`,
        expectedType: "mcp-server",
        baseDir: ws.baseDir,
        scope: ws.scope,
      }).pipe(
        Effect.provideService(WorkspaceMutations, ws),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      if (resolvedRef.type !== "mcp-server") {
        return yield* makeAppError({
          code: "internal",
          detail: `Newly scaffolded MCP server resolved as ${resolvedRef.type}`,
        });
      }
      yield* Effect.scoped(
        installMcpServer({
          name: "install-mcp-server",
          args: {
            ref: resolvedRef,
            force: args.force,
            versionRange: Option.none(),
            skipSettings: Option.none(),
            env: Option.none(),
          },
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.provideService(WorkspaceMutations, ws),
          Effect.provideService(CliRenderer, renderer),
          Effect.provideService(CodingAgentRepository, agentRepo),
        ),
      );
      const configuredAgentIds = yield* ws.getConfiguredAgents();
      const agentsByConfigPath = new Map<string, Set<string>>();
      const catalogAgents = Object.values(CONFIGURABLE_AGENTS_BY_ID);
      for (const agentId of configuredAgentIds) {
        const agent = catalogAgents.find((candidate) => candidate.id === agentId);
        const capability = agent?.capabilities["mcp-server"];
        if (capability === undefined || capability.axm.writer === null) {
          continue;
        }
        for (const target of capability.axm.writer.config.targets) {
          if (target.scope !== ws.scope) {
            continue;
          }
          const configPath = path.relative(ws.baseDir, path.resolve(ws.baseDir, target.path));
          const agentIds = agentsByConfigPath.get(configPath) ?? new Set<string>();
          agentIds.add(agentId);
          agentsByConfigPath.set(configPath, agentIds);
        }
      }
      const agentConfigTargets: Array<JobStepArtifactTarget> = Array.from(
        agentsByConfigPath.entries(),
      )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([configPath, agentIds]) => ({
          path: configPath,
          change: "created",
          agentIds: Array.from(agentIds).sort(),
        }));
      return {
        result: "success",
        message: `Created ${fqn}`,
        artifact: {
          path: sourcePath,
          scope: ws.scope,
          change: "created",
          targets: [
            {
              path: sourcePath,
              change: "created",
            },
            {
              path: ".axm (config/lockfile)",
              change: "created",
            },
            ...agentConfigTargets,
          ],
        },
      } satisfies JobStepResult;
    }),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "New MCP server",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
    displayApplied: false,
  });
  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "mcps", args.name, MCP_SERVER_MANIFEST_FILENAME)}\` to configure the MCP server`,
    },
  ];
  const artifactOutput = mcpNewArtifactOutput(resolution);
  const emitted = yield* emitPlanResolutionResult(
    "mcps.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? {
          summary: `Created MCP server ${fqn}${artifactOutput?.targetPhrase ?? ""}`,
          suggestions,
        }
      : undefined,
  );
  if (resolution._tag === "ExecutedPlan") {
    yield* emitScaffoldSuccess({
      message: `Created MCP server ${fqn}${artifactOutput?.targetPhrase ?? ""}`,
      ...(artifactOutput === undefined ? {} : { summary: artifactOutput.summary }),
      suggestions,
      withoutSuggestions: emitted,
    });
  }
});

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the MCP server")),
  description: Flag.string("description").pipe(
    Flag.withDescription("Description for the MCP server"),
    Flag.withDefault(""),
  ),
  owner: Flag.string("owner").pipe(
    Flag.withDescription("Override the workspace owner (e.g., @acme)"),
    Flag.optional,
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, description, owner, yes, force, preview }) =>
    handleMcpServersNew({
      name: decodeExtensionNameSync(name),
      description,
      owner,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withAuthRuntime("mcps new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new MCP server"),
  Command.withExamples([
    { command: "axm mcps new context", description: "Create a new MCP server manifest" },
    {
      command: "axm mcps new context --owner @acme",
      description: "Create under a specific owner",
    },
    {
      command: "axm mcps new context --preview",
      description: "Preview the files that would be created",
    },
  ]),
);
