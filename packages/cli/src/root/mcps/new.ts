import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import {
  previewOrApplyPlan,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  installMcpServer,
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  type McpServerManifest,
  type RegistryMcpServerRef,
} from "@agentxm/client-core/unstable/mcps";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
import { joinDisplayPath } from "../shared/display-path.js";
import { resolveOwnerForNewContent } from "../shared/resolve-owner.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

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
    ? normalizeOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("MCP server creation");
  const version = decodeVersionSync("0.1.0");
  const fqn = formatFqn({ owner, type: "mcp-server", name: args.name });

  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid MCP server name: "${args.name}"`,
    });
  }

  const targetDir = path.join(ws.baseDir, REGISTRY_EXTENSIONS_DIR, owner, "mcps", args.name);
  const manifestPath = path.join(targetDir, MCP_SERVER_MANIFEST_FILENAME);
  const exists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));
  if (exists && !args.force) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Managed MCP server directory already exists: ${targetDir}`,
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
  const ref: RegistryMcpServerRef = {
    type: "mcp-server",
    refType: "registry",
    source: { type: "registry", location: new URL("file:///"), owner: Option.some(owner) },
    owner,
    name: args.name,
    version,
    integrity: Option.none(),
    packages: [],
    server: { name: args.name },
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
        source: fqn,
        enabled: true,
        authored: true,
        env: {},
      });
      yield* installMcpServer({
        name: "install-mcp-server",
        args: {
          ref,
          force: args.force,
          versionRange: Option.none(),
          skipSettings: Option.none(),
          env: Option.none(),
          nonInteractive: Option.some(true),
        },
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(WorkspaceMutations, ws),
        Effect.provideService(CliRenderer, renderer),
        Effect.provideService(CodingAgentRepository, agentRepo),
      );
      return { result: "success" as const, message: `Created ${fqn}` };
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
    force: args.force,
    preview: args.preview,
  });
  const suggestions = [
    {
      description: `Edit \`${joinDisplayPath(path, ".axm", "extensions", owner, "mcps", args.name, MCP_SERVER_MANIFEST_FILENAME)}\` to configure the MCP server`,
    },
  ];
  const emitted = yield* emitPlanResolutionResult(
    "mcps.new",
    resolution,
    resolution._tag === "ExecutedPlan" ? { summary: `Created ${fqn}`, suggestions } : undefined,
  );
  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created ${fqn}`, { suggestions, withoutSuggestions: emitted });
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
