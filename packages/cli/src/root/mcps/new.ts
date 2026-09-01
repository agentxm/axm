import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import {
  createCanonicalDirectory,
  preflightCreateOnly,
  recoverCanonicalDirectory,
} from "@agentxm/extension-management/unstable/extensions";
import {
  decodeExtensionNameSync,
  formatFqn,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { CodingAgentRepository } from "@agentxm/extension-management/unstable/agents";
import { CONFIGURABLE_AGENTS_BY_ID } from "@agentxm/extension-model/unstable/agent-capabilities";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import {
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
} from "@agentxm/extension-management/unstable/plan";
import {
  DEFAULT_WORKSPACE_SCOPE,
  resolveWorkspaceExtensionRef,
  WorkspaceMutations,
} from "@agentxm/extension-management/unstable/workspace";
import { surfaceRestorationIncomplete } from "@agentxm/extension-management/unstable/workspace";
import {
  operationPresentation,
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { installMcpServer } from "@agentxm/extension-management/unstable/mcps";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { isNonInteractiveOptional } from "@agentxm/extension-management/unstable/cli-flags";
import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { isValidScaffoldName, normalizeScaffoldOwner } from "../shared/scaffold-name.js";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceAuthoredRoot, workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import {
  appErrorToStepFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";

export const handleMcpServersNew = (args: {
  readonly name: ExtensionName;
  readonly description: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "mcps.new",
      mode: args.preview ? "preview" : "apply",
      planName: "New MCP server",
    },
    handleMcpServersNewBody(args),
  );

const handleMcpServersNewBody = Effect.fn("McpServersNew.handle")(function* (args: {
  readonly name: ExtensionName;
  readonly description: string;
  readonly owner: Option.Option<string>;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;
  const httpClient = yield* HttpClient.HttpClient;
  const owner = Option.isSome(args.owner)
    ? normalizeScaffoldOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("MCP server creation");
  yield* requireAuthoredOwner(owner);
  const version = decodeVersionSync("0.1.0");
  const fqn = formatFqn({ owner, type: "mcp-server", name: args.name });

  if (!isValidScaffoldName(args.name)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid MCP server name: "${args.name}"`,
    });
  }

  const targetDir = path.join(workspaceAuthoredRoot(path, ws, "mcp-server", owner), args.name);
  const manifestPath = path.join(targetDir, MCP_SERVER_MANIFEST_FILENAME);
  const sourcePath = path.relative(ws.baseDir, targetDir);
  const configuredServers = yield* ws
    .getConfiguredMcpServerEntries()
    .pipe(Effect.mapError(toAppError));
  yield* preflightCreateOnly({
    subject: "MCP server",
    name: args.name,
    configured: Object.hasOwn(configuredServers, args.name),
    destinations: [],
  });

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
  const configuredAgentIds = yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));
  const agentsByConfigPath = new Map<string, Set<string>>();
  const catalogAgents = Object.values(CONFIGURABLE_AGENTS_BY_ID);
  for (const agentId of configuredAgentIds) {
    const agent = catalogAgents.find((candidate) => candidate.id === agentId);
    const capability = agent?.capabilities["mcp-server"];
    if (capability === undefined || capability.axm.writer === null) continue;
    for (const target of capability.axm.writer.config.targets) {
      if (target.scope !== ws.scope) continue;
      const configPath = path.relative(ws.baseDir, path.resolve(ws.baseDir, target.path));
      const agentIds = agentsByConfigPath.get(configPath) ?? new Set<string>();
      agentIds.add(agentId);
      agentsByConfigPath.set(configPath, agentIds);
    }
  }
  const agentConfigTargets: Array<JobStepArtifactTarget> = Array.from(agentsByConfigPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([configPath, agentIds]) => ({
      path: configPath,
      change: "created",
      agentIds: Array.from(agentIds).sort(),
    }));
  const plannedArtifact: JobStepArtifact = {
    path: sourcePath,
    scope: ws.scope,
    change: "created",
    targets: [
      { path: path.relative(ws.baseDir, manifestPath), change: "created" },
      { path: workspaceSettingsPath(ws.scope), change: "created" },
      ...agentConfigTargets,
    ],
  };
  const step: PlannedJobStep = {
    readiness: "ready",
    label: fqn,
    artifact: plannedArtifact,
    run: ws
      .runTransaction({
        targets: [targetDir],
        transition: Effect.gen(function* () {
          const currentConfigured = yield* ws
            .getConfiguredMcpServerEntries()
            .pipe(Effect.mapError(toAppError));
          yield* recoverCanonicalDirectory({ baseDir: ws.baseDir, canonicalPath: targetDir }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          yield* preflightCreateOnly({
            subject: "MCP server",
            name: args.name,
            configured: Object.hasOwn(currentConfigured, args.name),
            destinations: [targetDir],
          }).pipe(Effect.provideService(FileSystem.FileSystem, fs));
          yield* createCanonicalDirectory({
            baseDir: ws.baseDir,
            canonicalPath: targetDir,
            subject: "MCP server",
            requiredFiles: [MCP_SERVER_MANIFEST_FILENAME],
            populate: (stagingPath) =>
              fs
                .writeFileString(
                  path.join(stagingPath, MCP_SERVER_MANIFEST_FILENAME),
                  `${JSON.stringify(manifest, null, 2)}\n`,
                )
                .pipe(
                  Effect.mapError((error) =>
                    makeAppError({
                      code: "internal",
                      detail: `Failed to stage MCP server manifest for ${targetDir}`,
                      cause: error,
                    }),
                  ),
                ),
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          yield* ws
            .setMcpServerEntry(args.name, {
              source: "workspace",
              enabled: true,
              env: {},
            })
            .pipe(Effect.mapError(toAppError));
          const resolvedRef = yield* resolveWorkspaceExtensionRef({
            settingsName: args.name,
            source: "workspace",
            expectedType: "mcp-server",
            layout: ws.layout,
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
                nonInteractive: yield* isNonInteractiveOptional,
                force: false,
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
              Effect.provideService(HttpClient.HttpClient, httpClient),
            ),
          );
        }),
        validate: () =>
          Effect.gen(function* () {
            const currentConfigured = yield* ws
              .getConfiguredMcpServerEntries()
              .pipe(Effect.mapError(toAppError));
            const manifestExists = yield* fs.exists(manifestPath).pipe(
              Effect.mapError((cause) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to validate MCP server manifest: ${manifestPath}`,
                  cause,
                }),
              ),
            );
            if (!Object.hasOwn(currentConfigured, args.name) || !manifestExists) {
              return yield* makeAppError({
                code: "internal",
                detail: `New MCP server '${args.name}' did not satisfy its observable contract`,
              });
            }
          }),
      })
      .pipe(surfaceRestorationIncomplete)
      .pipe(
        Effect.mapError((error) =>
          error._tag === "AppError" ? appErrorToStepFailure(error) : error,
        ),
        Effect.as({
          result: "success",
          message: `Created ${fqn}`,
          artifact: plannedArtifact,
        } satisfies JobStepResult),
      ),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "New MCP server",
    description: Option.some(`Create ${fqn}`),
    presentation: operationPresentation(
      { imperative: "create", past: "Created", gerund: "Creating" },
      "mcp-server",
    ),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["mcps", "new"],
      [
        ...(args.description.length === 0
          ? []
          : [recoveryOption("--description", protectedRecoveryValue())]),
        ...Option.match(args.owner, {
          onNone: () => [],
          onSome: (value) => [recoveryOption("--owner", publicRecoveryValue(value))],
        }),
        recoveryPositional(publicRecoveryValue(args.name)),
      ],
    ),
  );
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, sourcePath, MCP_SERVER_MANIFEST_FILENAME)}\` to configure the MCP server`,
    },
  ];
  yield* emitOperationResolution("mcps.new", resolution, { suggestions });
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
  preview: previewFlag,
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, description, owner, yes, preview }) =>
    handleMcpServersNew({
      name: decodeExtensionNameSync(name),
      description,
      owner,
      yes,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("mcps new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new MCP server in the project-workspace authoring root"),
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
