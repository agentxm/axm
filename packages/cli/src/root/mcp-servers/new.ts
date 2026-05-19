import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  decodeExtensionNameSync,
  normalizeHandle,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import {
  previewOrApplyPlan,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
} from "@agentxm/client-core/unstable/mcp-servers";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";
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
  const owner = Option.isSome(args.owner)
    ? normalizeOwner(args.owner.value)
    : yield* resolveOwnerForNewContent("MCP server creation");

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

  const targetDir = path.join(
    path.resolve("."),
    REGISTRY_EXTENSIONS_DIR,
    owner,
    "mcp-servers",
    args.name,
  );
  const manifestPath = path.join(targetDir, MCP_SERVER_MANIFEST_FILENAME);
  const exists = yield* fs.exists(targetDir).pipe(Effect.orElseSucceed(() => false));
  if (exists && !args.force) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Managed MCP server directory already exists: ${targetDir}`,
    });
  }

  const manifest = {
    $schema: MCP_SERVER_MANIFEST_SCHEMA_URL,
    owner,
    type: "mcp-server",
    name: args.name,
    version: "0.1.0",
    description: args.description || `MCP server ${args.name}`,
    license: "MIT",
    server: {
      $schema: MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
      name: `io.github.example/${args.name}`,
      description: args.description || `MCP server ${args.name}`,
      version: "0.1.0",
      packages: [
        {
          registryType: "npm",
          identifier: args.name,
          version: "0.1.0",
          transport: { type: "stdio" },
        },
      ],
    },
  };

  const step: PlannedJobStep = {
    readiness: "ready",
    label: `${owner}/mcp-servers/${args.name}`,
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
      return { result: "success" as const, message: `Created ${manifestPath}` };
    }),
  };
  const plan: Plan = {
    _tag: "Plan",
    name: "New MCP server",
    description: Option.some(`Create ${owner}/mcp-servers/${args.name}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("mcp-servers.new", resolution);
  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created ${owner}/mcp-servers/${args.name}`);
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
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withAuthRuntime("mcp-servers new")),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new MCP server"),
  Command.withExamples([
    { command: "axm mcp-servers new context", description: "Create a new MCP server manifest" },
    {
      command: "axm mcp-servers new context --owner @acme",
      description: "Create under a specific owner",
    },
    {
      command: "axm mcp-servers new context --preview",
      description: "Preview the files that would be created",
    },
  ]),
);
