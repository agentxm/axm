import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  decodeExtensionNameSync,
  normalizeHandle,
  type ExtensionName,
} from "@agentxm/client-core/unstable/extensions";
import {
  computeSourceHash,
  RenderedFilesMapSchema,
} from "@agentxm/client-core/unstable/extensions";
import {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_URL,
  computeSubagentPaths,
  subagentContentFilename,
  subagentContentPath,
  type SubagentManifest,
} from "@agentxm/client-core/unstable/subagents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { decodeExactSemverVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { emitPlanResolutionResult } from "../../../json-output.js";
import { resolveOwnerForNewContent } from "../../shared/resolve-owner.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;
const INITIAL_VERSION = decodeExactSemverVersionSync("0.0.1");

export interface SubagentsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly profile: Option.Option<string>;
  readonly agents: Option.Option<readonly string[]>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

const STARTER_BODY = "Describe what this subagent does and when to delegate work to it.\n";

const makeSubagentMd = (name: string) =>
  ["---", `name: ${name}`, "---", "", STARTER_BODY].join("\n");

const decodeRenderedFiles = Schema.decodeUnknownSync(RenderedFilesMapSchema);

export const handleSubagentsNew = Effect.fn("SubagentsNew.handle")(function* (
  args: SubagentsNewHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm subagents new");

  // 1. Resolve owner
  const owner = Option.isSome(args.profile)
    ? normalizeOwner(args.profile.value)
    : yield* resolveOwnerForNewContent("subagent creation");

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "SUBAGENT_NAME_INVALID",
      category: "validation",
      what: `Invalid subagent name: "${args.name}"`,
      breadcrumbs: [
        {
          task: "Recover",
          description: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
        },
      ],
    });
  }

  // 3. Check existence
  const existingSubagent = yield* ws.getLockedSubagent(args.name);
  if (Option.isSome(existingSubagent) && !args.force) {
    return yield* makeAppError({
      code: "SUBAGENT_ALREADY_EXISTS",
      category: "conflict",
      what: `Subagent '${args.name}' already exists`,
      breadcrumbs: [
        {
          task: "Recover",
          description:
            "Choose a different name, remove the existing subagent first, or use --force",
        },
      ],
    });
  }

  // 4. Resolve agents
  const agents = Option.isSome(args.agents) ? args.agents.value : yield* ws.getConfiguredAgents();

  // 5. Build the scaffold operation as a plan step
  const fqn = `${owner}/subagents/${args.name}`;
  const base = ws.baseDir;

  const step: PlannedJobStep = {
    readiness: "ready",
    label: fqn,
    run: Effect.gen(function* () {
      const extensionName = decodeExtensionNameSync(args.name);

      // Compute paths
      const { canonicalPath, subagentSrcPath } = computeSubagentPaths(
        path.join,
        base,
        { refType: "registry", owner },
        args.name,
      );

      // Create subagent directory (src/ implies canonicalPath is also created)
      yield* fs.makeDirectory(subagentSrcPath, { recursive: true }).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "SUBAGENT_CREATE_FAILED",
            category: "internal",
            what: `Failed to create subagent directory: ${subagentSrcPath}`,
            cause: e,
          }),
        ),
      );

      // Write manifest
      const manifest: SubagentManifest = {
        $schema: MANIFEST_SCHEMA_URL,
        owner,
        type: "subagent",
        name: extensionName,
        version: INITIAL_VERSION,
      };

      yield* fs
        .writeFileString(
          path.join(canonicalPath, MANIFEST_FILENAME),
          JSON.stringify(manifest, null, 2) + "\n",
        )
        .pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "SUBAGENT_CREATE_FAILED",
              category: "internal",
              what: `Failed to write subagent manifest`,
              cause: e,
            }),
          ),
        );

      // Write starter content file
      const subagentMdContent = makeSubagentMd(args.name);
      const contentFilename = subagentContentFilename(args.name);

      yield* fs
        .writeFileString(
          subagentContentPath(path.join, subagentSrcPath, args.name),
          subagentMdContent,
        )
        .pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "SUBAGENT_CREATE_FAILED",
              category: "internal",
              what: `Failed to write ${contentFilename}`,
              cause: e,
            }),
          ),
        );

      // Register in settings
      yield* ws.setSubagentEntry(args.name, {
        source: fqn,
        enabled: true,
        authored: true,
      });

      // Render to configured agents
      const configuredAgents = yield* agentRepo.getConfiguredAgents();

      const renderedFilesMap: Record<string, Array<{ path: string }>> = {};

      yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .addSubagent({
              workspaceRoot: base,
              scope: "project",
              input: {
                agentId: agent.id,
                name: args.name,
                body: STARTER_BODY,
                frontmatter: { name: args.name },
                agentOverrides: undefined,
              },
              force: args.force,
            })
            .pipe(
              Effect.map((outcome) => {
                if (outcome._tag === "success") {
                  renderedFilesMap[agent.id] = outcome.renderedFilePaths.map((p) => ({
                    path: p,
                  }));
                }
              }),
            ),
        { concurrency: "unbounded" },
      );

      // Update lockfile
      const now = new Date();
      const sourceHash = computeSourceHash(subagentMdContent);

      yield* ws.setSubagentLock({
        name: args.name,
        lockEntry: {
          type: "registry",
          owner,
          name: extensionName,
          resolvedVersion: INITIAL_VERSION,
          integrity: "",
          sourceName: "local",
          agents: [...agents],
          installedAt: now,
          updatedAt: now,
          sourceHash,
          renderedFiles: decodeRenderedFiles(renderedFilesMap),
        },
      });

      return {
        result: "success",
        message: `Created subagent ${fqn}`,
      } satisfies JobStepResult;
    }).pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "New subagent",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  const breadcrumbs = [
    {
      task: "edit",
      description: `Edit \`.axm/extensions/${owner}/subagents/${args.name}/src/${args.name}.md\` to fill in instructions`,
    },
    {
      task: "sync",
      description: "Apply changes to your workspace",
      command: ["axm", "sync"],
    },
  ];

  const emitted = yield* emitPlanResolutionResult(
    "subagents.new",
    resolution,
    resolution._tag === "ExecutedPlan"
      ? { summary: `Created subagent ${fqn}`, breadcrumbs }
      : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    yield* renderer.success(`Created subagent ${fqn}`, {
      breadcrumbs,
      withoutBreadcrumbs: emitted,
    });
  }
});
