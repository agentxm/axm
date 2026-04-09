import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import {
  decodeExtensionNameSync,
  normalizeHandle,
  type ExtensionName,
} from "@axm.sh/core/unstable/extensions";
import { computeSourceHash, RenderedFilesMapSchema } from "@axm.sh/core/unstable/extensions";
import {
  MANIFEST_FILENAME,
  MANIFEST_SCHEMA_URL,
  SUBAGENT_CONTENT_FILENAME,
  computeSubagentPaths,
  isToolAccessLevel,
  type SubagentManifest,
} from "@axm.sh/core/unstable/subagents";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { previewOrApplyPlan } from "@axm.sh/core/unstable/workspace";
import { CodingAgentRepository } from "@axm.sh/core/unstable/agents";
import { decodeExactSemverVersionSync } from "@axm.sh/core/unstable/version-constraints";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;
const INITIAL_VERSION = decodeExactSemverVersionSync("0.0.1");

export interface SubagentsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly profile: Option.Option<string>;
  readonly agents: Option.Option<readonly string[]>;
  readonly model: Option.Option<string>;
  readonly toolAccess: Option.Option<string>;
  readonly background: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);

const makeSubagentMd = (args: {
  readonly name: string;
  readonly model: Option.Option<string>;
  readonly toolAccess: Option.Option<string>;
  readonly background: boolean;
}) => {
  const lines = [`---`, `name: ${args.name}`, `description: A new subagent`];
  if (Option.isSome(args.model)) {
    lines.push(`model: ${args.model.value}`);
  }
  if (Option.isSome(args.toolAccess)) {
    lines.push(`toolAccess: ${args.toolAccess.value}`);
  }
  if (args.background) {
    lines.push(`background: true`);
  }
  lines.push(`---`, ``, `Describe what this subagent does and when to delegate work to it.`, ``);
  return lines.join("\n");
};

const decodeRenderedFiles = Schema.decodeUnknownSync(RenderedFilesMapSchema);

export const handleSubagentsNew = Effect.fn("SubagentsNew.handle")(function* (
  args: SubagentsNewHandlerArgs,
) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  yield* renderer.info("axm subagents new");

  // 1. Resolve profile
  const owner = Option.isSome(args.profile)
    ? normalizeOwner(args.profile.value)
    : yield* ws.getConfiguredProfile().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeAppError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No profile configured for subagent creation",
                  howToFix:
                    "Configure a profile in settings.json with `axm init`, or use --profile",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  // 2. Validate name
  if (
    args.name.length === 0 ||
    args.name.length > MAX_NAME_LENGTH ||
    !NAME_PATTERN.test(args.name)
  ) {
    return yield* makeAppError({
      code: "SUBAGENT_NAME_INVALID",
      what: `Invalid subagent name: "${args.name}"`,
      details: [
        "Subagent names must be lowercase, start with a letter or digit,",
        "contain only letters, digits, and hyphens, and not exceed 64 characters.",
      ],
      howToFix: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
    });
  }

  // 3. Check existence
  const existingSubagent = yield* ws.getLockedSubagent(args.name);
  if (Option.isSome(existingSubagent) && !args.force) {
    return yield* makeAppError({
      code: "SUBAGENT_ALREADY_EXISTS",
      what: `Subagent '${args.name}' already exists`,
      howToFix: "Choose a different name, remove the existing subagent first, or use --force",
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
        ...(Option.isSome(args.model) ? { model: args.model.value } : {}),
        ...(Option.isSome(args.toolAccess) && isToolAccessLevel(args.toolAccess.value)
          ? { toolAccess: args.toolAccess.value }
          : {}),
        ...(args.background ? { background: true } : {}),
        agents: [...agents],
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
              what: `Failed to write subagent manifest`,
              cause: e,
            }),
          ),
        );

      // Write starter SUBAGENT.md
      const subagentMdContent = makeSubagentMd({
        name: args.name,
        model: args.model,
        toolAccess: args.toolAccess,
        background: args.background,
      });

      yield* fs
        .writeFileString(path.join(subagentSrcPath, SUBAGENT_CONTENT_FILENAME), subagentMdContent)
        .pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "SUBAGENT_CREATE_FAILED",
              what: `Failed to write SUBAGENT.md`,
              cause: e,
            }),
          ),
        );

      // Register in settings
      yield* ws.setSubagentEntry(args.name, {
        source: fqn,
        enabled: true,
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
                description: "A new subagent",
                model: Option.getOrUndefined(args.model),
                toolAccess: Option.match(args.toolAccess, {
                  onNone: () => undefined,
                  onSome: (v) => (isToolAccessLevel(v) ? v : undefined),
                }),
                background: args.background || undefined,
                body: "Describe what this subagent does and when to delegate work to it.\n",
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
      Effect.provideService(Workspace, ws),
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

  yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success(`Created subagent ${fqn}`);
});
